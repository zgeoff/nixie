// A destination-like token in a text, with the form it compares in. A BSB and account number also
// carries the account number alone as its part.
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

  // an Australian BSB and its account number, whose digits may sit in groups, with an optional
  // account word between them; neither pattern takes part of a longer run of digit groups or of an
  // international number, which the phone pattern takes whole
  {
    kind: 'account',
    pattern:
      /(?<!\+[\p{Zs}\t]?|\d[\p{Zs}\t-]?)\b\d{3}[\p{Zs}\t-]?\d{3},?(?:[\p{Zs}\t]+(?:account|acct|a\/c)(?:[\p{Zs}\t]+(?:number|no\.?))?:?)?[\p{Zs}\t]+(?<account>\d(?:[\p{Zs}\t]?\d){4,8})\b(?![\p{Zs}\t-]?\d)/giu,
  },

  // a run of 6 to 17 digits right after an account word, such as "account number is"
  {
    kind: 'account',
    pattern:
      /(?<=\b(?:account|acct|a\/c)(?:[\p{Zs}\t]+(?:number|no\.?|#))?(?:[\p{Zs}\t]+is|[\p{Zs}\t]*[:#])?[\p{Zs}\t]*)\d(?:[\p{Zs}\t-]?\d){5,16}\b(?![\p{Zs}\t-]?\d)/giu,
  },
  { kind: 'phone', pattern: /\+?\d[\d\p{Zs}\t().-]{5,}\d/gu },
  { kind: 'domain', pattern: /\b(?:[\p{L}\p{N}-]+\.)+\p{L}{2,63}\b/gu },
];

// Finds the destination-like tokens in a text. A URL is found before an email inside it, and an
// email's domain or a URL's host is never a second token.
export function collectDestinationTokens(text: string): readonly DestinationToken[] {
  const tokens: DestinationToken[] = [];
  const taken: TokenRange[] = [];

  for (const entry of patterns) {
    tokens.push(...collectPatternTokens(text, entry, taken));
  }

  return tokens;
}

const trailing = /[.,;:!?)\]}'"’”]+$/u;

// a match that overlaps a token an earlier pattern took is part of that token, a phone number needs
// at least 7 digits, and a BSB and account number keeps the account number alone as its part
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

    const token = {
      kind: entry.kind,
      key: buildTokenKey(entry.kind, match[0]),
      raw: match[0].replace(trailing, ''),
    };

    const part = match.groups?.['account']?.replaceAll(/\D/gu, '');

    return part === undefined ? [token] : [{ ...token, part }];
  });
}

// Phone numbers and IBANs compare by their digits and letters, a domestic account number by its
// digits alone, a URL by its scheme and host without case and its path, query and fragment exactly,
// and every other kind without case.
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
