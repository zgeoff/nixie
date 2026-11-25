import type { FetchReply } from '@heynixie/wire';
import type { MailHTMLReader } from '../types';

export interface TestHTMLReader extends MailHTMLReader {
  // answers the HTML that a test names with the page the fetch sandbox would read from it
  readonly answer: (html: string, page: FetchReply) => void;
}

// The reader of a mail's HTML in a test. It answers only the HTML a test gave it, because the parse
// of HTML is the fetch guest's own, with its own tests, and an integration test reads mail through
// the real fetch sandbox.
export function buildTestHTMLReader(): TestHTMLReader {
  const pages = new Map<string, FetchReply>();

  return {
    readHTML: (html) =>
      Promise.resolve(
        pages.get(html) ?? {
          kind: 'failed',
          reason: 'the test gave the reader no page for this HTML',
          isGated: false,
        },
      ),
    answer: (html, page) => {
      pages.set(html, page);
    },
  };
}
