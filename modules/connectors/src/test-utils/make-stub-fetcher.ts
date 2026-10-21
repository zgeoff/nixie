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
