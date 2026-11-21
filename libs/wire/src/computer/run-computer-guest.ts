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

// A guest is one process that answers request frames one at a time, until its input closes. A
// handler may send hop frames while it works, and each waits for the server's pass.
export async function runComputerGuest(
  io: ComputerGuestIO,
  handle: ComputerHandler,
  maxFrameBytes: number,
): Promise<void> {
  const decode = makeFrameDecoder(maxFrameBytes);
  const reader = io.input.getReader();
  const pending: Uint8Array<ArrayBuffer>[] = [];

  const readFrame = async (): Promise<Uint8Array<ArrayBuffer> | null> => {
    while (pending.length === 0) {
      const chunk = await reader.read();

      if (chunk.done) {
        return null;
      }

      pending.push(...decode(chunk.value));
    }

    return pending.shift() ?? null;
  };

  const askServer = async (hop: ComputerHopFrame): Promise<void> => {
    await io.write(encodeFrame(encodeComputerMessage(hop)));

    const frame = await readFrame();

    if (frame === null) {
      throw new Error('the input closed before the server answered a hop');
    }

    const answer = parseJSONOrNull(new TextDecoder().decode(frame));

    if (typeof answer !== 'object' || answer === null || !('kind' in answer)) {
      throw new TypeError('a computer hop needs a hop-pass or hop-refuse frame in answer');
    }

    if (answer.kind === 'hop-refuse') {
      const reason = 'reason' in answer ? String(answer.reason) : 'the server refused the hop';

      throw new Error(reason);
    }

    if (answer.kind !== 'hop-pass') {
      throw new TypeError('a computer hop needs a hop-pass or hop-refuse frame in answer');
    }
  };

  const askScan: AskScan = (url) => askServer({ kind: 'hop', url });
  const askScanText: AskScanText = (text) => askServer({ kind: 'hop-content', text });

  for (;;) {
    const frame = await readFrame();

    if (frame === null) {
      return;
    }

    const reply = await handle(decodeComputerRequest(frame), askScan, askScanText);

    await io.write(encodeFrame(encodeComputerMessage(reply)));
  }
}
