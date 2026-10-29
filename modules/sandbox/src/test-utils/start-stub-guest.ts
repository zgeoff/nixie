import type { GuestFrame, HostFrame, InboxMessage } from '@heynixie/wire';
import { decodeTurnFrame, encodeTurnFrame, hostFrameSchema } from '@heynixie/wire';
import type { ExecStream, StreamExit } from '../types';

type TurnFrame = Extract<HostFrame, { type: 'turn' }>;

type SummarizeFrame = Extract<HostFrame, { type: 'summarize' }>;

interface StubGuest {
  readonly signal?: AbortSignal;

  readonly interrupt?: AbortSignal;

  readonly waitForMessage: () => Promise<InboxMessage>;

  readonly takeMessage?: () => InboxMessage | undefined;

  readonly emit?: (frames: readonly GuestFrame[]) => void;
}

export type StubGuestScript = (
  turn: TurnFrame,
  guest: StubGuest,
) => Promise<readonly GuestFrame[]> | readonly GuestFrame[];

export type StubSummaryScript = (
  frame: SummarizeFrame,
) => Promise<readonly GuestFrame[]> | readonly GuestFrame[];

export interface StubGuestHooks {
  readonly onTurn: StubGuestScript;
  readonly onSummary: StubSummaryScript;
  readonly onPurge: () => Promise<readonly GuestFrame[]> | readonly GuestFrame[];

  readonly onFrame?: (frame: HostFrame) => void;
}

type FirstFrame = Exclude<HostFrame, { type: 'message' | 'interrupt' }>;

const noStderr = { bytes: new Uint8Array(0), totalBytes: 0, isCut: false };

export function startStubGuest(hooks: StubGuestHooks): ExecStream {
  const output = new TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>();

  const writer = output.writable.getWriter();
  const exit = Promise.withResolvers<StreamExit>();

  const stopping = new AbortController();
  const interrupting = new AbortController();

  const inbox = buildMessageQueue(stopping.signal);
  const sending = { done: Promise.resolve() };

  const emit = (frames: readonly GuestFrame[]) => {
    if (stopping.signal.aborted) {
      return;
    }

    const previous = sending.done;

    sending.done = (async () => {
      await previous;
      await writeFrames(writer, frames);
    })();
  };

  const stopGuest = async (ended: StreamExit) => {
    await sending.done;

    await writer.close().catch(() => {});

    exit.resolve(ended);
  };

  const runScript = async (first: FirstFrame) => {
    const answer = await tryRunFirstFrame(hooks, first, {
      signal: stopping.signal,
      interrupt: interrupting.signal,
      waitForMessage: inbox.wait,
      takeMessage: inbox.take,
      emit,
    });

    if (stopping.signal.aborted) {
      return;
    }

    emit(answer);

    await stopGuest({ code: 0, signal: null, stderr: noStderr });
  };

  return {
    messages: output.readable,
    send: (bytes) => {
      const frame = decodeTurnFrame(hostFrameSchema, bytes);

      hooks.onFrame?.(frame);

      if (frame.type === 'message') {
        inbox.push(frame.message);
      } else if (frame.type === 'interrupt') {
        interrupting.abort();
      } else {
        void runScript(frame);
      }

      return Promise.resolve();
    },
    exit: exit.promise,
    stop: async () => {
      stopping.abort(new Error('the host stopped the guest'));

      await stopGuest({ code: null, signal: 'SIGTERM', stderr: noStderr });

      return exit.promise;
    },
  };
}

function buildMessageQueue(signal: AbortSignal): {
  readonly push: (message: InboxMessage) => void;
  readonly wait: () => Promise<InboxMessage>;
  readonly take: () => InboxMessage | undefined;
} {
  const queued: InboxMessage[] = [];
  const waiting: PromiseWithResolvers<InboxMessage>[] = [];

  signal.addEventListener(
    'abort',
    () => {
      for (const waiter of waiting.splice(0)) {
        waiter.reject(buildStoppedError(signal));
      }
    },
    { once: true },
  );

  return {
    push: (message) => {
      const waiter = waiting.shift();

      if (waiter === undefined) {
        queued.push(message);
      } else {
        waiter.resolve(message);
      }
    },
    take: () => queued.shift(),
    wait: () => {
      const message = queued.shift();

      if (message !== undefined) {
        return Promise.resolve(message);
      }

      if (signal.aborted) {
        return Promise.reject(buildStoppedError(signal));
      }

      const next = Promise.withResolvers<InboxMessage>();

      waiting.push(next);

      return next.promise;
    },
  };
}

function buildStoppedError(signal: AbortSignal): Error {
  return new Error('the stub guest stopped while it waited for a message', {
    cause: signal.reason,
  });
}

async function writeFrames(
  writer: WritableStreamDefaultWriter<Uint8Array<ArrayBuffer>>,
  frames: readonly GuestFrame[],
): Promise<void> {
  for (const frame of frames) {
    await writer.write(encodeTurnFrame(frame)).catch(() => {});
  }
}

async function tryRunFirstFrame(
  hooks: StubGuestHooks,
  first: FirstFrame,
  guest: StubGuest,
): Promise<readonly GuestFrame[]> {
  try {
    return await runFirstFrame(hooks, first, guest);
  } catch (error) {
    return [{ type: 'failed', reason: 'error', detail: String(error) }];
  }
}

function runFirstFrame(
  hooks: StubGuestHooks,
  first: FirstFrame,
  guest: StubGuest,
): Promise<readonly GuestFrame[]> | readonly GuestFrame[] {
  if (first.type === 'purge') {
    return hooks.onPurge();
  }

  if (first.type === 'summarize') {
    return hooks.onSummary(first);
  }

  return hooks.onTurn(first, guest);
}
