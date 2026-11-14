import type { FetchReply, FetchRequest } from '@heynixie/wire';
import {
  decodeFetchRequest,
  encodeFetchMessage,
  encodeFrame,
  makeFrameDecoder,
} from '@heynixie/wire';
import type { StubGuest } from './build-stub-sandbox-adapter';

export type StubFetcherAnswer =
  | FetchReply
  | { readonly kind: 'crash' }
  | { readonly kind: 'hang' }
  | { readonly kind: 'garbage' };

export interface StubFetcherOptions {
  // the URLs of the hop frames it sends before its answer, each followed by a wait for one frame
  readonly hops?: readonly string[];

  // gets the text of every frame the fetcher reads, the request first
  readonly received?: string[];
}

export function makeStubFetcher(
  answer: (request: FetchRequest) => StubFetcherAnswer,
  options: StubFetcherOptions = {},
): StubGuest {
  return async (stdin, stdout) => {
    const reader = openFrameReader(stdin, options.received ?? []);

    const requestFrame = await reader.read();

    const request = decodeFetchRequest(requestFrame);

    for (const url of options.hops ?? []) {
      await stdout.write(encodeFrame(encodeFetchMessage({ kind: 'hop', url })));
      await reader.read();
    }

    const picked = answer(request);

    if (picked.kind === 'crash') {
      return 1;
    }

    if (picked.kind === 'hang') {
      return Promise.withResolvers<number>().promise;
    }

    const message =
      picked.kind === 'garbage' ? new TextEncoder().encode('not json') : encodeFetchMessage(picked);

    await stdout.write(encodeFrame(message));

    return 0;
  };
}

interface FrameReader {
  readonly read: () => Promise<Uint8Array>;
}

function openFrameReader(stdin: ReadableStream<Uint8Array>, received: string[]): FrameReader {
  const decode = makeFrameDecoder(65_536);
  const reader = stdin.getReader();
  const pending: Uint8Array[] = [];

  const decoder = new TextDecoder();

  return {
    read: async () => {
      while (pending.length === 0) {
        const chunk = await reader.read();

        if (chunk.done) {
          throw new Error('stdin closed before a frame');
        }

        pending.push(...decode(chunk.value));
      }

      const message = pending.shift() ?? new Uint8Array();

      received.push(decoder.decode(message));

      return message;
    },
  };
}
