import { buildWebFetchTool, makeFetchBackoff } from '@heynixie/connectors';
import type { TestMail } from '@heynixie/mail/test-utils';
import type { ToolDefinition } from '@heynixie/tools';
import type { FetchReply } from '@heynixie/wire';

// The web_fetch tool of a test mailbox: it shares the mailbox's log, so it opens the links that
// mail.read numbered, and it reaches the site a test started on a loopback port with a real
// request, as the fetch sandbox would reach a site.
export function buildTestWebFetch(mail: Pick<TestMail, 'context' | 'clock'>): ToolDefinition {
  return buildWebFetchTool(readTestPage, {
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

async function readTestPage(url: string): Promise<FetchReply> {
  const response = await fetch(url);

  return {
    kind: 'page',
    retryAfterMs: null,
    isGated: true,
    url,
    status: response.status,
    contentType: response.headers.get('content-type'),
    text: await response.text(),
    links: [],
    isTruncated: false,
    blocked: null,
  };
}
