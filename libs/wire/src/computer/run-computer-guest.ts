import { encodeFrame } from '../frame/encode-frame';
import { makeFrameDecoder } from '../frame/make-frame-decoder';
import { parseJSONOrNull } from '../utils/parse-json-or-null';
import type { ComputerHopFrame } from './computer-hop-frame';
import type { ComputerReply } from './computer-reply';
import type { ComputerRequest } from './computer-request';
import { decodeComputerRequest } from './decode-computer-request';
import { encodeComputerMessage } from './encode-computer-message';

export interface ComputerGuestIO {
  readonly input: ReadableStream<Uint8Array>;
  readonly write: (bytes: Uint8Array) => Promise<void>;
}

// asks the server to scan a URL and waits for its pass; rejects when the server stops the guest
export type AskScan = (url: string) => Promise<void>;

// asks the server to scan the text of a request's headers or body, which holds no URL to exempt
export type AskScanText = (text: string) => Promise<void>;

export type ComputerHandler = (
  request: ComputerRequest,
  askScan: AskScan,
  askScanText: AskScanText,
) => Promise<ComputerReply>;

export interface ComputerScanAsks {
  readonly askScan: AskScan;
  readonly askScanText: AskScanText;
}

export interface ComputerGuestOptions {
  // Called once, before the first frame is read, with the asks of the guest's scan channel. The
  // channel stays open until the input closes, so a guest can ask for a scan while no request runs.
  readonly onReady?: (asks: ComputerScanAsks) => void;
}

// A guest answers request frames one at a time, until its input closes. Its scan channel is
// separate: any part of the guest may send a hop frame at any time. The server answers hops in the
// order it receives them, so the guest sends one hop at a time.
export async function runComputerGuest(
  io: ComputerGuestIO,
  handle: ComputerHandler,
  maxFrameBytes: number,
  options: ComputerGuestOptions = {},
): Promise<void> {
  const requests = makeFrameQueue();
  const answers = makeAnswerQueue();
  const runInTurn = makeTurnRunner();
  const send = (frame: Uint8Array): Promise<void> => runInTurn(() => io.write(frame));
  const askServer = makeAsker(send, answers);

  const asks: ComputerScanAsks = {
    askScan: (url) => askServer({ kind: 'hop', url }),
    askScanText: (text) => askServer({ kind: 'hop-content', text }),
  };

  options.onReady?.(asks);
  const pumping = pumpFrames(io.input, maxFrameBytes, requests, answers);

  for (;;) {
    const frame = await requests.next();

    if (frame === null) {
      break;
    }

    const reply = await handle(decodeComputerRequest(frame), asks.askScan, asks.askScanText);

    await send(encodeFrame(encodeComputerMessage(reply)));
  }

  await pumping;
}

interface FrameQueue {
  readonly push: (frame: Uint8Array<ArrayBuffer>) => void;
  readonly end: () => void;
  readonly next: () => Promise<Uint8Array<ArrayBuffer> | null>;
}

function makeFrameQueue(): FrameQueue {
  const frames: Uint8Array<ArrayBuffer>[] = [];
  const waiting: ((frame: Uint8Array<ArrayBuffer> | null) => void)[] = [];
  let isEnded = false;

  return {
    push: (frame) => {
      const waiter = waiting.shift();

      if (waiter === undefined) {
        frames.push(frame);
      } else {
        waiter(frame);
      }
    },
    end: () => {
      isEnded = true;

      for (const waiter of waiting.splice(0)) {
        waiter(null);
      }
    },
    next: () => {
      const frame = frames.shift();

      if (frame !== undefined) {
        return Promise.resolve(frame);
      }

      if (isEnded) {
        return Promise.resolve(null);
      }

      return new Promise((resolve) => {
        waiting.push(resolve);
      });
    },
  };
}

type HopAnswer = { readonly kind: 'pass' } | { readonly kind: 'refuse'; readonly reason: string };

interface AnswerQueue {
  readonly push: (answer: HopAnswer) => void;
  readonly end: () => void;
  readonly next: () => Promise<HopAnswer>;
}

interface Waiter {
  readonly resolve: (answer: HopAnswer) => void;
  readonly reject: (error: Error) => void;
}

const inputClosedMessage = 'the input closed before the server answered a hop';

function makeAnswerQueue(): AnswerQueue {
  const answers: HopAnswer[] = [];
  const waiting: Waiter[] = [];
  let isEnded = false;

  return {
    push: (answer) => {
      const waiter = waiting.shift();

      if (waiter === undefined) {
        answers.push(answer);
      } else {
        waiter.resolve(answer);
      }
    },
    end: () => {
      isEnded = true;

      for (const waiter of waiting.splice(0)) {
        waiter.reject(new Error(inputClosedMessage));
      }
    },
    next: () => {
      const answer = answers.shift();

      if (answer !== undefined) {
        return Promise.resolve(answer);
      }

      if (isEnded) {
        return Promise.reject(new Error(inputClosedMessage));
      }

      return new Promise((resolve, reject) => {
        waiting.push({ resolve, reject });
      });
    },
  };
}

// Runs each call after the one before it ends, so frames never interleave and hops go one at a time.
function makeTurnRunner(): <Result>(run: () => Promise<Result>) => Promise<Result> {
  let last: Promise<void> = Promise.resolve();

  return async (run) => {
    const before = last;
    const ended = Promise.withResolvers<void>();

    last = ended.promise;

    await before;

    try {
      return await run();
    } finally {
      ended.resolve();
    }
  };
}

function makeAsker(
  send: (frame: Uint8Array) => Promise<void>,
  answers: AnswerQueue,
): (hop: ComputerHopFrame) => Promise<void> {
  const runInTurn = makeTurnRunner();

  return (hop) =>
    runInTurn(async () => {
      await send(encodeFrame(encodeComputerMessage(hop)));

      const answer = await answers.next();

      if (answer.kind === 'refuse') {
        throw new Error(answer.reason);
      }
    });
}

async function pumpFrames(
  input: ReadableStream<Uint8Array>,
  maxFrameBytes: number,
  requests: FrameQueue,
  answers: AnswerQueue,
): Promise<void> {
  const decode = makeFrameDecoder(maxFrameBytes);
  const reader = input.getReader();

  try {
    for (;;) {
      const chunk = await reader.read();

      if (chunk.done) {
        return;
      }

      for (const frame of decode(chunk.value)) {
        const answer = readHopAnswer(frame);

        if (answer === null) {
          requests.push(frame);
        } else {
          answers.push(answer);
        }
      }
    }
  } finally {
    answers.end();
    requests.end();
  }
}

function readHopAnswer(frame: Uint8Array): HopAnswer | null {
  const value = parseJSONOrNull(new TextDecoder().decode(frame));

  if (typeof value !== 'object' || value === null || !('kind' in value)) {
    return null;
  }

  if (value.kind === 'hop-pass') {
    return { kind: 'pass' };
  }

  if (value.kind === 'hop-refuse') {
    return {
      kind: 'refuse',
      reason: 'reason' in value ? String(value.reason) : 'the server refused the hop',
    };
  }

  return null;
}
