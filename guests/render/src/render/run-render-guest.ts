import type { RenderReply } from '@heynixie/wire';
import {
  decodeRenderRequest,
  encodeFrame,
  encodeRenderMessage,
  makeFrameDecoder,
  renderFrameLimitBytes,
} from '@heynixie/wire';
import { drawPicture } from './draw-picture';

export interface RenderGuestIO {
  readonly input: ReadableStream<Uint8Array>;
  readonly write: (bytes: Uint8Array) => Promise<void>;
}

// Reads one request frame, renders it and writes one reply frame. A request that does not decode
// gets a failed reply, and so does a render that fails.
export async function runRenderGuest(io: RenderGuestIO): Promise<void> {
  const frame = await readFirstFrame(io.input);

  const reply: RenderReply =
    frame === null
      ? { kind: 'failed', reason: 'the input closed before a whole request arrived' }
      : await drawFrame(frame);

  await io.write(encodeFrame(encodeRenderMessage(reply)));
}

async function readFirstFrame(input: ReadableStream<Uint8Array>): Promise<Uint8Array | null> {
  const decode = makeFrameDecoder(renderFrameLimitBytes);
  const reader = input.getReader();

  try {
    for (;;) {
      const chunk = await reader.read();

      if (chunk.done) {
        return null;
      }

      const [first] = decode(chunk.value);

      if (first !== undefined) {
        return first;
      }
    }
  } finally {
    await reader.cancel();
  }
}

async function drawFrame(frame: Uint8Array): Promise<RenderReply> {
  try {
    return await drawPicture(decodeRenderRequest(frame));
  } catch (error) {
    return { kind: 'failed', reason: error instanceof Error ? error.message : String(error) };
  }
}
