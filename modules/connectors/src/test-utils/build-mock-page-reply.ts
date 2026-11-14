import type { FetchReply } from '@heynixie/wire';

type PageReply = Extract<FetchReply, { kind: 'page' }>;

export function buildMockPageReply(url: string, overrides: Partial<PageReply> = {}): PageReply {
  return {
    kind: 'page',
    retryAfterMs: null,
    isGated: false,
    url,
    status: 200,
    contentType: 'text/plain',
    text: 'A page',
    links: [],
    isTruncated: false,
    blocked: null,
    ...overrides,
  };
}
