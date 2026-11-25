import { startFetchSandbox } from '@heynixie/connectors';
import { buildStubSandboxAdapter, makeStubFetcher } from '@heynixie/connectors/test-utils';
import type { MailHTMLReader } from '@heynixie/mail';
import type { FetchReply } from '@heynixie/wire';

export interface SandboxHTMLReader extends MailHTMLReader {
  // answers the HTML that a test names with the page the fetcher would read from it
  readonly answer: (html: string, page: FetchReply) => void;
  readonly stop: () => Promise<void>;
}

// The reader of a mail's HTML in an integration test: the real fetch sandbox over a stand-in fetcher, so each
// request travels the wire as it does in a deployment. The fetcher answers only the HTML a test
// gave it, because the parse of HTML is the fetch guest's own, with its own tests.
export function buildSandboxHTMLReader(): SandboxHTMLReader {
  const pages = new Map<string, FetchReply>();

  const adapter = buildStubSandboxAdapter(
    makeStubFetcher((request) => {
      const page = request.html === undefined ? undefined : pages.get(request.html);

      return (
        page ?? {
          kind: 'failed',
          reason: 'the test gave the fetcher no page for this HTML',
          isGated: false,
        }
      );
    }),
  );

  const sandbox = startFetchSandbox({
    adapter,
    image: 'nixie-fetch',
    argv: ['bun', '/app/fetch.js'],
    limits: {
      bodyBytes: 100_000,
      timeoutMs: 5000,
      redirects: 0,
      textBytes: 300_000,
      imageBytes: 0,
    },
    deniedRanges: [],
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
  });

  return {
    readHTML: (html) => sandbox.readHTML(html),
    answer: (html, page) => {
      pages.set(html, page);
    },
    stop: () => sandbox.stop(),
  };
}
