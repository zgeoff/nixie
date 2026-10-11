import type { FetchReply, FetchRequest } from '@heynixie/wire';
import {
  decodeFetchRequest,
  encodeFetchMessage,
  encodeFrame,
  makeFrameDecoder,
} from '@heynixie/wire';
import type { StubGuest } from './build-stub-sandbox-adapter';

// What the stub fetcher does with a request: reply, exit 1 with no reply, never answer, or reply
// with a frame that holds no fetch reply.
export type StubFetcherAnswer =
  | FetchReply
  | { readonly kind: 'crash' }
  | { readonly kind: 'hang' }
  | { readonly kind: 'garbage' };

// Makes a guest that speaks the fetcher's wire format: it reads one request frame and answers it
// as answer picks, as the real fetcher does over its stdin and stdout.
export function makeStubFetcher(answer: (request: FetchRequest) => StubFetcherAnswer): StubGuest {
  return async (stdin, stdout) => {
    const request = await readRequest(stdin);
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

async function readRequest(stdin: ReadableStream<Uint8Array>): Promise<FetchRequest> {
  const decode = makeFrameDecoder(65_536);

  for await (const chunk of stdin) {
    const [message] = decode(chunk);

    if (message !== undefined) {
      return decodeFetchRequest(message);
    }
  }
  throw new Error('stdin closed before a request');
}
