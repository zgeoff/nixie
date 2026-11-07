import { getLinkTargetLimit } from '@heynixie/wire';
import type { ReadableText } from './build-readable-text';

export interface TextWithinLimit extends ReadableText {
  readonly isCut: boolean;
}

const linkMarkPattern = /\u{E000}(?<index>\d+)\u{E001}/gu;

// Builds the text cut to at most limit bytes of UTF-8, never inside a character, with the targets of
// its marks within the link target limit, so long links cannot pass the reply's size limit. Indexes
// follow the text's order, so the kept targets run from the first, and later marks leave the text.
export function buildTextWithinLimit(readable: ReadableText, limit: number): TextWithinLimit {
  const written = new TextEncoder().encodeInto(readable.text, new Uint8Array(limit));

  const isCut = written.read !== readable.text.length;
  const text = isCut ? readable.text.slice(0, written.read) : readable.text;
  const kept = countKeptTargets(text, readable.links, getLinkTargetLimit(limit));

  return {
    text: text.replaceAll(linkMarkPattern, (mark) =>
      Number(mark.slice(1, -1)) < kept ? mark : '',
    ),
    links: readable.links.slice(0, kept),
    isCut,
  };
}

function countKeptTargets(text: string, links: readonly string[], targetLimit: number): number {
  let targetBytes = 0;
  let kept = 0;

  for (const match of text.matchAll(linkMarkPattern)) {
    const index = Number(match.groups?.['index']);

    if (index === kept) {
      targetBytes += Buffer.byteLength(links[index] ?? '');

      if (targetBytes > targetLimit) {
        return kept;
      }

      kept += 1;
    }
  }

  return kept;
}
