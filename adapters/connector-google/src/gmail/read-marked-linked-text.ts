import type { Log, ToolRun } from '@heynixie/connections';
import { parseLinkMarks } from '@heynixie/wire';
import type { GoogleToolkit, LinkLimits, LinkedText } from './types';

// A body that the fetch sandbox read: its text, with a mark where each link ends.
export interface MarkedBody {
  readonly text: string;
  readonly links: readonly string[];
}

interface MarkedLinkedTextDeps {
  readonly toolkit: Pick<GoogleToolkit, 'renderLinkedText' | 'writeHitLinks'>;
  readonly log: Pick<Log, 'writer'>;
}

// Numbers each link of a body in the session of the call, as a search hit is, and returns the text
// with each link as its tag, such as `[L4 · example.org/docs/…]`. Null when the session ended. The
// text never holds a link's address.
export async function readMarkedLinkedText(
  deps: MarkedLinkedTextDeps,
  run: ToolRun,
  body: MarkedBody,
  limits: LinkLimits,
): Promise<LinkedText | null> {
  const marked = parseLinkMarks(body.text);

  const urls = marked.flatMap((part) => {
    const target = typeof part === 'string' ? undefined : body.links[part.link];

    return target === undefined ? [] : [target];
  });

  const numbers = await deps.toolkit.writeHitLinks(deps.log, run, urls);

  return numbers === null
    ? null
    : deps.toolkit.renderLinkedText(marked, { pageURL: '', targets: body.links, numbers }, limits);
}
