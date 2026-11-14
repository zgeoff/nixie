export interface DestinationToken {
  readonly kind: 'account' | 'domain' | 'email' | 'handle' | 'phone' | 'url';
  readonly key: string;
  readonly raw: string;
  readonly part?: string;
}

interface TokenRange {
  readonly start: number;
  readonly end: number;
}

interface TokenPattern {
  readonly kind: DestinationToken['kind'];
  readonly pattern: RegExp;
}

const patterns: readonly TokenPattern[] = [
  { kind: 'url', pattern: /\b(?:https?:\/\/|www\.)[^\s<>"]+/giu },
  { kind: 'email', pattern: /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu },
  { kind: 'handle', pattern: /(?<![\p{L}\p{N}._%+-])@[\p{L}\p{N}_.]{2,}/gu },
  {
    kind: 'account',
    pattern: /\b[A-Z]{2}\d{2}(?:\s?[A-Z\d]{4}){2,7}(?:\s?[A-Z\d]{1,4})?\b/gu,
  },

  {
    kind: 'account',
    pattern:
      /(?<!\+[\p{Zs}\t]?|\d[\p{Zs}\t-]?)\b\d{3}[\p{Zs}\t-]?\d{3},?(?:[\p{Zs}\t]+(?:account|acct|a\/c)(?:[\p{Zs}\t]+(?:number|no\.?))?:?)?[\p{Zs}\t]+(?<account>\d(?:[\p{Zs}\t]?\d){4,8})\b(?![\p{Zs}\t-]?\d)/giu,
  },

  {
    kind: 'account',
    pattern:
      /(?<=\b(?:account|acct|a\/c)(?:[\p{Zs}\t]+(?:number|no\.?|#))?(?:[\p{Zs}\t]+is|[\p{Zs}\t]*[:#])?[\p{Zs}\t]*)\d(?:[\p{Zs}\t-]?\d){5,16}\b(?![\p{Zs}\t-]?\d)/giu,
  },
  { kind: 'phone', pattern: /\+?\d[\d\p{Zs}\t().-]{5,}\d/gu },
  { kind: 'domain', pattern: /\b(?:[\p{L}\p{N}-]+\.)+\p{L}{2,63}\b/gu },
];

export function collectDestinationTokens(text: string): readonly DestinationToken[] {
  const tokens: DestinationToken[] = [];
  let taken: readonly TokenRange[] = [];

  for (const entry of patterns) {
    const collected = collectPatternTokens(text, entry, taken);

    tokens.push(...collected.tokens);

    taken = mergeRanges(taken, collected.ranges);
  }

  return tokens;
}

const trailing = /[.,;:!?)\]}'"’”]+$/u;

interface PatternTokens {
  readonly tokens: readonly DestinationToken[];
  readonly ranges: readonly TokenRange[];
}

// One pattern's matches never overlap each other, so a match is checked only against the sorted
// ranges of the patterns before it, which keeps a text full of matches from costing quadratic time.
function collectPatternTokens(
  text: string,
  entry: TokenPattern,
  taken: readonly TokenRange[],
): PatternTokens {
  const ranges: TokenRange[] = [];

  const tokens = [...text.matchAll(entry.pattern)].flatMap((match) => {
    const range = { start: match.index, end: match.index + match[0].length };
    const isShortNumber = entry.kind === 'phone' && match[0].replaceAll(/\D/gu, '').length < 7;

    if (hasOverlap(taken, range) || isShortNumber) {
      return [];
    }

    ranges.push(range);

    const token = {
      kind: entry.kind,
      key: buildTokenKey(entry.kind, match[0]),
      raw: match[0].replace(trailing, ''),
    };

    const part = match.groups?.['account']?.replaceAll(/\D/gu, '');

    return part === undefined ? [token] : [{ ...token, part }];
  });

  return { tokens, ranges };
}

// The ranges are sorted and never overlap, so their ends are sorted too, and the first range that
// ends after the start is the only one that can overlap.
function hasOverlap(taken: readonly TokenRange[], range: TokenRange): boolean {
  let low = 0;
  let high = taken.length;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);

    if ((taken[middle]?.end ?? 0) <= range.start) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  const next = taken[low];

  return next !== undefined && next.start < range.end;
}

function buildTokenKey(kind: DestinationToken['kind'], raw: string): string {
  const cleaned = raw.normalize('NFC').replace(trailing, '');

  if (kind === 'account' && !/^[A-Z]{2}\d{2}/u.test(cleaned)) {
    return cleaned.replaceAll(/\D/gu, '');
  }

  if (kind === 'phone' || kind === 'account') {
    return cleaned.replaceAll(/[^\d+A-Z]/gu, '');
  }

  if (kind === 'url') {
    const match = /^(?<scheme>https?:\/\/)?(?<host>[^/?#]+)(?<path>.*)$/iu.exec(cleaned);
    const groups = match?.groups;

    return groups === undefined
      ? cleaned
      : `${(groups['scheme'] ?? '').toLowerCase()}${(groups['host'] ?? '').toLowerCase()}${groups['path'] ?? ''}`;
  }

  return cleaned.toLowerCase();
}

function mergeRanges(
  left: readonly TokenRange[],
  right: readonly TokenRange[],
): readonly TokenRange[] {
  return [...left, ...right].toSorted((first, second) => first.start - second.start);
}
