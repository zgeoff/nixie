import type { Log } from '@heynixie/log';
import type { ToolRun } from '@heynixie/tools';
import { getPageSession } from '../utils/get-page-session';
import { formatLinkTag } from '../utils/render-linked-text';
import { writeHitLinks } from './write-hit-links';

interface LinkTagRequest {
  readonly urls: readonly string[];
  readonly linkPathChars: number;
}

// Numbers each URL in the session of the call, as a search hit is, and returns each URL's tag, such
// as `[L4 · example.org/docs/…]`. Null when the session ended, which a forget does. A tool outside
// the web tools reads a link that way, and web_fetch opens it by the ID.
export async function writeLinkTags(
  log: Pick<Log, 'writer'>,
  run: ToolRun,
  request: LinkTagRequest,
): Promise<ReadonlyMap<string, string> | null> {
  const numbers = await writeHitLinks(log, getPageSession(run), request.urls);

  if (numbers === null) {
    return null;
  }

  return new Map(
    [...numbers].map(([url, number]) => [
      url,
      formatLinkTag(number, url, { pageHost: null, linkPathChars: request.linkPathChars }),
    ]),
  );
}
