import type { Log } from '@heynixie/log';
import type { ToolRun } from '@heynixie/tools';
import { getPageSession } from '../../utils/get-page-session';
import type { LinkedText, TagSpan } from '../../utils/render-linked-text';
import { formatLinkTag } from '../../utils/render-linked-text';
import { writeHitLinks } from '../../web/write-hit-links';
import type { LinkLimits } from './types';

const urlPattern = /https?:\/\/[^\s<>"'`]+/gu;
const trailingPunctuation = /[.,;:!?)\]}]+$/u;

// The same for a plain-text body, whose links are the addresses it writes out.
export async function readPlainLinkedText(
  log: Pick<Log, 'writer'>,
  run: ToolRun,
  text: string,
  limits: LinkLimits,
): Promise<LinkedText | null> {
  const found = [...text.matchAll(urlPattern)].map((match) => ({
    start: match.index,
    url: match[0].replace(trailingPunctuation, ''),
  }));

  const numbers = await writeHitLinks(log, getPageSession(run), [
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

    const tag = formatLinkTag(number, entry.url, {
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
