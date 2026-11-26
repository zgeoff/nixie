import type { Log } from '@heynixie/log';
import type { ToolRun } from '@heynixie/tools';
import { parseLinkMarks } from '@heynixie/wire';
import { getPageSession } from '../../utils/get-page-session';
import type { LinkedText } from '../../utils/render-linked-text';
import { renderLinkedText } from '../../utils/render-linked-text';
import { writeHitLinks } from '../../web/write-hit-links';
import type { LinkLimits } from './types';

// A body that the fetch sandbox read: its text, with a mark where each link ends.
export interface MarkedBody {
  readonly text: string;
  readonly links: readonly string[];
}

// Numbers each link of a body in the session of the call, as a search hit is, and returns the text
// with each link as its tag, such as `[L4 · example.org/docs/…]`. Null when the session ended. The
// text never holds a link's address.
export async function readMarkedLinkedText(
  log: Pick<Log, 'writer'>,
  run: ToolRun,
  body: MarkedBody,
  limits: LinkLimits,
): Promise<LinkedText | null> {
  const marked = parseLinkMarks(body.text);

  const urls = marked.flatMap((part) => {
    const target = typeof part === 'string' ? undefined : body.links[part.link];

    return target === undefined ? [] : [target];
  });

  const numbers = await writeHitLinks(log, getPageSession(run), urls);

  return numbers === null
    ? null
    : renderLinkedText(marked, { pageURL: '', targets: body.links, numbers }, limits);
}
