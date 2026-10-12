// oxlint-disable typescript/prefer-readonly-parameter-types -- the scan's own list of taken ranges, and a RegExp, which has no readonly form

// A destination-like token in a text, with the form it compares in.
export interface DestinationToken {
  readonly kind: 'account' | 'domain' | 'email' | 'handle' | 'phone' | 'url';
  readonly key: string;
  readonly raw: string;
}

// Finds the destination-like tokens in a text. A URL is found before an email inside it, and an
// email's domain or a URL's host is never a second token.
export function findDestinationTokens(text: string): readonly DestinationToken[] {
  const tokens: DestinationToken[] = [];
  const taken: TokenRange[] = [];

  for (const entry of patterns) {
    tokens.push(...collectPatternTokens(text, entry, taken));
  }
  return tokens;
}

interface TokenRange {
  readonly start: number;
  readonly end: number;
}

interface TokenPattern {
  readonly kind: DestinationToken['kind'];
  readonly pattern: RegExp;
}

// a match that overlaps a token an earlier pattern took is part of that token, and a phone number
// needs at least 7 digits
function collectPatternTokens(
  text: string,
  entry: TokenPattern,
  taken: TokenRange[],
): readonly DestinationToken[] {
  return [...text.matchAll(entry.pattern)].flatMap((match) => {
    const range = { start: match.index, end: match.index + match[0].length };
    const overlaps = taken.some((other) => range.start < other.end && other.start < range.end);
    const isShortNumber = entry.kind === 'phone' && match[0].replaceAll(/\D/gu, '').length < 7;

    if (overlaps || isShortNumber) {
      return [];
    }
    taken.push(range);
    return [
      {
        kind: entry.kind,
        key: buildTokenKey(entry.kind, match[0]),
        raw: match[0].replace(trailing, ''),
      },
    ];
  });
}

const trailing = /[.,;:!?)\]}'"’”]+$/u;

const patterns: readonly TokenPattern[] = [
  { kind: 'url', pattern: /\b(?:https?:\/\/|www\.)[^\s<>"]+/giu },
  { kind: 'email', pattern: /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu },
  { kind: 'handle', pattern: /(?<![\p{L}\p{N}._%+-])@[\p{L}\p{N}_.]{2,}/gu },
  {
    kind: 'account',
    pattern: /\b[A-Z]{2}\d{2}(?:\s?[A-Z\d]{4}){2,7}(?:\s?[A-Z\d]{1,4})?\b/gu,
  },
  { kind: 'phone', pattern: /\+?\d[\d\p{Zs}\t().-]{5,}\d/gu },
  { kind: 'domain', pattern: /\b(?:[\p{L}\p{N}-]+\.)+\p{L}{2,63}\b/gu },
];

// Phone and account numbers compare by their digits and letters, a URL by its scheme and host
// without case and its path, query and fragment exactly, and every other kind without case.
function buildTokenKey(kind: DestinationToken['kind'], raw: string): string {
  const cleaned = raw.normalize('NFC').replace(trailing, '');

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
