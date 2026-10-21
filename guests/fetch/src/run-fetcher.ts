import type { FetchReply, FetchRequest } from '@heynixie/wire';
import {
  decodeFetchRequest,
  encodeFetchMessage,
  encodeFrame,
  makeFrameDecoder,
} from '@heynixie/wire';

export interface FetcherIO {
  readonly input: AsyncIterable<Uint8Array> | Iterable<Uint8Array>;
  readonly write: (bytes: Uint8Array) => Promise<void>;
}

export async function runFetcher(
  io: FetcherIO,
  readPageFor: (request: FetchRequest) => Promise<FetchReply>,
): Promise<void> {
  const frame = await readFirstFrame(io.input);

  const request = decodeFetchRequest(frame);

  const reply = await readPageFor(request);

  await io.write(encodeFrame(encodeFetchMessage(reply)));
}

const maxRequestBytes = 65_536;

async function readFirstFrame(
  input: AsyncIterable<Uint8Array> | Iterable<Uint8Array>,
): Promise<Uint8Array> {
  const decode = makeFrameDecoder(maxRequestBytes);

  for await (const chunk of input) {
    const [message] = decode(chunk);

    if (message !== undefined) {
      return message;
    }
  }

  throw new Error('the input closed before a whole request arrived');
}
