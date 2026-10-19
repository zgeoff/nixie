import type { TextRange } from './collect-quoted-blocks';
import { collectQuotedBlocks } from './collect-quoted-blocks';
import type { OwnerMessage } from './gate-types';
import type { MatchText } from './normalize-match-text';
import { normalizeMatchText } from './normalize-match-text';

// Where a quote sits in one message: wholly in typed text outside every quoted block, only in a
// quoted block, only where some character was not typed, or nowhere.
export type QuoteMatch =
  | { readonly status: 'typed'; readonly start: number; readonly end: number }
  | { readonly status: 'in_quoted_block' | 'not_typed' | 'missing' };

// Unicode format characters: zero-width spaces and joiners, bidirectional controls, the byte order
// mark and the soft hyphen
const invisible = /\p{Cf}/u;

// Finds the quote in NFC with whitespace collapsed, on grapheme boundaries. Any one typed
// occurrence outside a quoted block passes, so a pasted copy elsewhere never hides it. A quote with
// an invisible format character never matches.
export function getTypedQuote(message: OwnerMessage, quote: string): QuoteMatch {
  const needle = normalizeMatchText(quote).text.trim();

  if (needle.length === 0 || invisible.test(quote)) {
    return { status: 'missing' };
  }

  const blocks = collectQuotedBlocks(message.text);

  const matches = collectOccurrences(normalizeMatchText(message.text), needle).map((range) =>
    pickOccurrenceMatch(message, blocks, range),
  );

  return (
    matches.find((match) => match.status === 'typed') ??
    matches.find((match) => match.status === 'in_quoted_block') ??
    matches.find((match) => match.status === 'not_typed') ?? { status: 'missing' }
  );
}

// each occurrence that starts and ends on grapheme boundaries, as a range of the original text
function collectOccurrences(text: MatchText, needle: string): readonly TextRange[] {
  const ranges: TextRange[] = [];

  for (
    let from = text.text.indexOf(needle);
    from !== -1;
    from = text.text.indexOf(needle, from + 1)
  ) {
    const after = from + needle.length;

    const isOnBoundaries =
      text.boundaries.has(from) && (after === text.text.length || text.boundaries.has(after));

    if (isOnBoundaries) {
      ranges.push({ start: text.starts[from] ?? 0, end: text.ends[after - 1] ?? 0 });
    }
  }

  return ranges;
}

function pickOccurrenceMatch(
  message: OwnerMessage,
  blocks: readonly TextRange[],
  range: TextRange,
): QuoteMatch {
  if (isInBlock(blocks, range)) {
    return { status: 'in_quoted_block' };
  }

  return isTypedRange(message, range) ? { status: 'typed', ...range } : { status: 'not_typed' };
}

function isInBlock(blocks: readonly TextRange[], range: TextRange): boolean {
  return blocks.some((block) => range.start < block.end && block.start < range.end);
}

// every character must lie in a span the client labelled typed, so an unknown span fails
function isTypedRange(message: OwnerMessage, range: TextRange): boolean {
  for (let at = range.start; at < range.end; at += 1) {
    const span = message.spans.find((candidate) => candidate.start <= at && at < candidate.end);

    if (span?.source !== 'typed') {
      return false;
    }
  }

  return true;
}
