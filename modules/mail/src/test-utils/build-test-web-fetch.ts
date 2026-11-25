import { buildWebFetchTool, makeFetchBackoff } from '@heynixie/connectors';
import type { ToolDefinition } from '@heynixie/tools';
import type { FetchReply } from '@heynixie/wire';
import type { TestMail } from './start-test-mail';

// The web_fetch tool of a test mailbox: it shares the mailbox's log, so it opens the links that
// mail.read numbered, and it answers each page from the pages the test gives, by URL.
export function buildTestWebFetch(
  mail: Pick<TestMail, 'context' | 'clock'>,
  pages: ReadonlyMap<string, string>,
): ToolDefinition {
  return buildWebFetchTool((url) => Promise.resolve(buildPageReply(url, pages.get(url))), {
    log: mail.context.log,
    textBytes: 20_000,
    linkPathChars: 24,
    pageStoreBytes: 20_971_520,
    imageLongEdge: 1568,
    backoff: makeFetchBackoff({
      backoffMs: 30_000,
      backoffCapMs: 300_000,
      clock: mail.clock,
    }),
    backoffWaitMs: 5000,
    cacheMs: 0,
    findSecret: () => null,
    isOwnerTyped: () => Promise.resolve(false),
    logger: () => {},
    secretTypedURLCovers: 'redirects',
    clock: mail.clock,
  });
}

function buildPageReply(url: string, text: string | undefined): FetchReply {
  return {
    kind: 'page',
    retryAfterMs: null,
    isGated: true,
    url,
    status: text === undefined ? 404 : 200,
    contentType: 'text/html',
    text: text ?? 'Not found.',
    links: [],
    isTruncated: false,
    blocked: null,
  };
}
