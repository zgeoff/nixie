import {
  buildMockPageReply,
  buildStubSandboxAdapter,
  makeStubFetcher,
} from '@heynixie/connectors/test-utils';
import type { SandboxAdapter } from '@heynixie/sandbox';

export interface FetchPage {
  readonly url: string;

  readonly text: string;
}

// Answers each fetch sandbox from a canned page, because the fetch guest refuses every address a
// test can serve. A sandbox of any other kind goes to the adapter it wraps.
export function buildFetchPageSandboxes(
  adapter: SandboxAdapter,
  pages: readonly FetchPage[],
): SandboxAdapter {
  const fetcher = buildStubSandboxAdapter(
    makeStubFetcher((request) => {
      const page = pages.find((candidate) => candidate.url === request.url);

      if (page === undefined) {
        return {
          kind: 'failed',
          reason: `the stub fetcher holds no page for ${request.url}`,
          isGated: false,
        };
      }

      return buildMockPageReply(request.url, {
        contentType: 'text/html; charset=utf-8',
        text: page.text,
      });
    }),
  );

  return {
    ...adapter,
    create: (spec) => (spec.kind === 'fetch' ? fetcher.create(spec) : adapter.create(spec)),
    read: async (id) => {
      const own = await fetcher.read(id);

      return own ?? adapter.read(id);
    },
    list: async (owner) => [...(await fetcher.list(owner)), ...(await adapter.list(owner))],
  };
}
