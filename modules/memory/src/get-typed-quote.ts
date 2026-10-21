import type { TextRange } from './collect-quoted-blocks';
import { collectQuotedBlocks } from './collect-quoted-blocks';
import type { OwnerMessage } from './gate-types';
import type { MatchText } from './normalize-match-text';
import { normalizeMatchText } from './normalize-match-text';

export type QuoteMatch =
  | { readonly status: 'typed'; readonly start: number; readonly end: number }
  | { readonly status: 'in_quoted_block' | 'not_typed' | 'missing' };

const invisible = /\p{Cf}/u;

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

function isTypedRange(message: OwnerMessage, range: TextRange): boolean {
  for (let at = range.start; at < range.end; at += 1) {
    const span = message.spans.find((candidate) => candidate.start <= at && at < candidate.end);

    if (span?.source !== 'typed') {
      return false;
    }
  }

  return true;
}
