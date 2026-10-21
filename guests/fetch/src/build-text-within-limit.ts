import { getLinkTargetLimit } from '@heynixie/wire';
import type { ReadableText } from './build-readable-text';

export interface TextWithinLimit extends ReadableText {
  readonly isCut: boolean;
}

// Builds the text cut to at most limit bytes of UTF-8, never inside a character, with the targets of
// its marks, which stay within the link target limit, so long links cannot pass the reply's size
// limit. Indexes follow the text's order, so a cut text's marks name a run of targets from the first.
export function buildTextWithinLimit(readable: ReadableText, limit: number): TextWithinLimit {
  const written = new TextEncoder().encodeInto(readable.text, new Uint8Array(limit));

  const isTextCut = written.read !== readable.text.length;
  const text = isTextCut ? readable.text.slice(0, written.read) : readable.text;
  const targetLimit = getLinkTargetLimit(limit);
  let targetBytes = 0;
  let kept = 0;

  for (const match of text.matchAll(/\u{E000}(?<index>\d+)\u{E001}/gu)) {
    const index = Number(match.groups?.['index']);

    if (index === kept) {
      targetBytes += Buffer.byteLength(readable.links[index] ?? '');

      if (targetBytes > targetLimit) {
        return {
          text: text.slice(0, match.index),
          links: readable.links.slice(0, kept),
          isCut: true,
        };
      }

      kept += 1;
    }
  }

  return { text, links: readable.links.slice(0, kept), isCut: isTextCut };
}
