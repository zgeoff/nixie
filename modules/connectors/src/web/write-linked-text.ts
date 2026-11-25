import type { Log } from '@heynixie/log';
import type { ToolRun } from '@heynixie/tools';
import { parseLinkMarks } from '@heynixie/wire';
import { getPageSession } from '../utils/get-page-session';
import { renderLinkedText } from '../utils/render-linked-text';
import { writeHitLinks } from './write-hit-links';

interface LinkedTextRequest {
  // the text of a fetcher's reply, with a mark where each link ends
  readonly text: string;

  // the target of each mark, by the index the mark names
  readonly links: readonly string[];
  readonly textBytes: number;
  readonly linkPathChars: number;
}

// Numbers each link of a text the fetcher read, in the session of the call as a search hit is, and
// returns the text with each mark replaced by its tag, such as `[L4 · example.org/docs/…]`. Null
// when the session ended, which a forget does. The text never holds a link's address.
export async function writeLinkedText(
  log: Pick<Log, 'writer'>,
  run: ToolRun,
  request: LinkedTextRequest,
): Promise<string | null> {
  const marked = parseLinkMarks(request.text);

  const urls = marked.flatMap((part) => {
    const target = typeof part === 'string' ? undefined : request.links[part.link];

    return target === undefined ? [] : [target];
  });

  const numbers = await writeHitLinks(log, getPageSession(run), urls);

  if (numbers === null) {
    return null;
  }

  return renderLinkedText(
    marked,
    { pageURL: '', targets: request.links, numbers },
    { textBytes: request.textBytes, linkPathChars: request.linkPathChars },
  ).text;
}
