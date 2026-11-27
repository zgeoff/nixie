import type { Log, ToolRun } from '@heynixie/connections';
import type { GoogleToolkit, LinkLimits, LinkedText, TagSpan } from './types';

const urlPattern = /https?:\/\/[^\s<>"'`]+/gu;
const trailingPunctuation = /[.,;:!?)\]}]+$/u;

interface PlainLinkedTextDeps {
  readonly toolkit: Pick<GoogleToolkit, 'formatLinkTag' | 'writeHitLinks'>;
  readonly log: Pick<Log, 'writer'>;
}

// The same for a plain-text body, whose links are the addresses it writes out.
export async function readPlainLinkedText(
  deps: PlainLinkedTextDeps,
  run: ToolRun,
  text: string,
  limits: LinkLimits,
): Promise<LinkedText | null> {
  const found = [...text.matchAll(urlPattern)].map((match) => ({
    start: match.index,
    url: match[0].replace(trailingPunctuation, ''),
  }));

  const numbers = await deps.toolkit.writeHitLinks(deps.log, run, [
    ...new Set(found.map((entry) => entry.url)),
  ]);

  if (numbers === null) {
    return null;
  }

  const pieces: string[] = [];
  const tags: TagSpan[] = [];
  let cursor = 0;
  let length = 0;

  for (const entry of found) {
    const number = numbers.get(entry.url);

    if (number === undefined) {
      continue;
    }

    const before = text.slice(cursor, entry.start);

    const tag = deps.toolkit.formatLinkTag(number, entry.url, {
      pageHost: null,
      linkPathChars: limits.linkPathChars,
    });

    pieces.push(before, tag);
    tags.push({ start: length + before.length, end: length + before.length + tag.length });

    length += before.length + tag.length;
    cursor = entry.start + entry.url.length;
  }

  pieces.push(text.slice(cursor));

  return { text: pieces.join(''), tags };
}
