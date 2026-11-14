import type { AskHop, FetchReply, FetchRequest } from '@heynixie/wire';
import {
  decodeFetchRequest,
  encodeFetchMessage,
  encodeFrame,
  makeFrameDecoder,
  makeHopAsker,
} from '@heynixie/wire';

export interface FetcherIO {
  readonly input: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array> | Iterable<Uint8Array>;
  readonly write: (bytes: Uint8Array) => Promise<void>;
}

export async function runFetcher(
  io: FetcherIO,
  readPageFor: (request: FetchRequest, askHop: AskHop | undefined) => Promise<FetchReply>,
): Promise<void> {
  const reader = openFrameReader(io.input);

  try {
    const first = await reader.frames.next();

    if (first.done === true) {
      throw new Error('the input closed before a whole request arrived');
    }

    const request = decodeFetchRequest(first.value);

    const askHop =
      request.hops === 'ask' ? makeHopAsker({ frames: reader.frames, write: io.write }) : undefined;

    const reply = await readPageFor(request, askHop);

    await io.write(encodeFrame(encodeFetchMessage(reply)));
  } finally {
    await reader.release();
  }
}

const maxFrameBytes = 65_536;

interface FrameReader {
  readonly frames: AsyncIterator<Uint8Array>;

  // A stream reader's cancel ends a read that still waits, which an iterator's return cannot, so
  // the process can exit while the server holds its input open.
  readonly release: () => Promise<void>;
}

function openFrameReader(input: FetcherIO['input']): FrameReader {
  const decode = makeFrameDecoder(maxFrameBytes);
  const pending: Uint8Array[] = [];
  const chunks = openChunks(input);

  return {
    frames: {
      next: async () => {
        while (pending.length === 0) {
          const chunk = await chunks.read();

          if (chunk.done === true) {
            return { done: true, value: undefined };
          }

          pending.push(...decode(chunk.value));
        }

        return { done: false, value: pending.shift() ?? new Uint8Array() };
      },
    },
    release: chunks.release,
  };
}

type ChunkResult =
  | { readonly done: true; readonly value?: Uint8Array | undefined }
  | { readonly done: false; readonly value: Uint8Array };

interface ChunkSource {
  readonly read: () => Promise<ChunkResult>;
  readonly release: () => Promise<void>;
}

function openChunks(input: FetcherIO['input']): ChunkSource {
  if (input instanceof ReadableStream) {
    const reader = input.getReader();

    return { read: () => reader.read(), release: () => reader.cancel() };
  }

  const iterator =
    Symbol.asyncIterator in input ? input[Symbol.asyncIterator]() : input[Symbol.iterator]();

  return {
    read: async () => {
      const next = await iterator.next();

      return next.done === true
        ? { done: true, value: undefined }
        : { done: false, value: next.value };
    },
    release: () => Promise.resolve(),
  };
}
