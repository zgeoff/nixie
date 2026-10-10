/* oxlint-disable max-statements, one-var -- a throwaway spike that keeps each check in one place */
// The code half of the memory write gate: the quote check and the destination-token check. The
// third check, a checker model, is out of scope here; the cases show where it is still needed.
export type SpanSource = 'dictated' | 'dropped' | 'pasted' | 'typed' | 'unknown';

export interface Span {
  end: number;
  source: SpanSource;
  start: number;
}

export interface OwnerMessage {
  spans: Span[];
  text: string;
}

export interface MemoryWrite {
  memory: string;
  quote: string;
}

export type Verdict =
  | { ok: true; quoteAt: number; tokens: string[] }
  | { ok: false; reason: string };

// Unicode format characters: zero-width spaces and joiners, bidi controls, the BOM and soft hyphen.
const INVISIBLE = /\p{Cf}/u;

// Text normalised for matching: NFC, and each run of whitespace collapsed to one space. `map[i]`
// and `ends[i]` are the start and end offsets in the original text of the grapheme that holds
// normalised unit i, and `starts` holds each normalised index where a grapheme begins.
interface Normalised {
  ends: number[];
  map: number[];
  starts: Set<number>;
  text: string;
}

const GRAPHEMES = new Intl.Segmenter('en', { granularity: 'grapheme' });

export function normalizeText(text: string): Normalised {
  const ends: number[] = [];
  const map: number[] = [];
  const starts = new Set<number>();
  let out = '';
  let inSpace = false;

  // NFC composes only within a grapheme, so each grapheme is normalised alone and every UTF-16
  // unit of its normalised form maps back to the grapheme's original offset.
  for (const part of GRAPHEMES.segment(text)) {
    if (/^\s+$/u.test(part.segment)) {
      if (!inSpace) {
        starts.add(out.length);
        out += ' ';
        map.push(part.index);
        ends.push(part.index + part.segment.length);
      }
      inSpace = true;
    } else {
      const nfc = part.segment.normalize('NFC');
      starts.add(out.length);
      out += nfc;
      map.push(...Array.from({ length: nfc.length }, () => part.index));
      ends.push(...Array.from({ length: nfc.length }, () => part.index + part.segment.length));
      inSpace = false;
    }
  }
  return { ends, map, starts, text: out };
}

// Block-level quoted regions that never count as evidence: blockquote lines, fenced code, and
// everything after a reply or forward header. Inline quotation marks are left to the checker
// model, because the owner often quotes a name or a title inside a statement of their own.
export function findQuotedBlocks(text: string): [number, number][] {
  const blocks: [number, number][] = [];
  const lines = text.split('\n');
  let offset = 0;
  let fenceStart = -1;
  for (const line of lines) {
    const end = offset + line.length;
    const trimmed = line.trimStart();
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      if (fenceStart === -1) {
        fenceStart = offset;
      } else {
        blocks.push([fenceStart, end]);
        fenceStart = -1;
      }
    } else if (fenceStart === -1 && trimmed.startsWith('>')) {
      blocks.push([offset, end]);
    } else if (
      fenceStart === -1 &&
      (/^On .{3,200} wrote:\s*$/u.test(trimmed) ||
        /^-{2,}\s*(?:Forwarded|Original) message\s*-{2,}/iu.test(trimmed) ||
        /^From: .+/u.test(trimmed))
    ) {
      blocks.push([offset, text.length]);
      break;
    }
    offset = end + 1;
  }
  if (fenceStart !== -1) {
    blocks.push([fenceStart, text.length]);
  }
  return blocks;
}

function isTypedRange(message: OwnerMessage, start: number, end: number): boolean {
  for (let at = start; at < end; at += 1) {
    const span = message.spans.find((candidate) => candidate.start <= at && at < candidate.end);
    if (span?.source !== 'typed') {
      return false;
    }
  }
  return true;
}

function isInBlock(blocks: [number, number][], start: number, end: number): boolean {
  return blocks.some(([from, to]) => start < to && from < end);
}

// Check 1: the quote appears word for word in text the owner typed, outside any quoted block.
// Every occurrence is tried, so a pasted copy elsewhere in the message does not hide a typed one.
export function checkQuote(message: OwnerMessage, quote: string): Verdict {
  if (INVISIBLE.test(quote)) {
    return { ok: false, reason: 'the quote holds an invisible character' };
  }
  const text = normalizeText(message.text);
  const needle = normalizeText(quote).text.trim();
  if (needle.length === 0) {
    return { ok: false, reason: 'the quote is empty' };
  }
  const blocks = findQuotedBlocks(message.text);
  let found = false;
  let from = text.text.indexOf(needle);
  while (from !== -1) {
    found = true;
    const start = text.map[from] ?? 0;
    const end = text.ends[from + needle.length - 1] ?? message.text.length;
    const after = from + needle.length;

    // A match must begin and end on grapheme boundaries, so a quote never ends inside a letter
    // whose combining mark arrived another way.
    const onBoundaries =
      text.starts.has(from) && (after === text.text.length || text.starts.has(after));
    if (onBoundaries && isTypedRange(message, start, end) && !isInBlock(blocks, start, end)) {
      return { ok: true, quoteAt: start, tokens: [] };
    }
    from = text.text.indexOf(needle, from + 1);
  }
  return {
    ok: false,
    reason: found
      ? 'the quote is in the message but not wholly in typed text outside a quoted block'
      : 'the quote is not in the message',
  };
}

// Destination-like tokens, each with the form it is compared in.
interface Token {
  kind: 'account' | 'domain' | 'email' | 'handle' | 'phone' | 'url';
  key: string;
  raw: string;
}

const TRAILING = /[.,;:!?)\]}'"’”]+$/u;
const PATTERNS: { kind: Token['kind']; pattern: RegExp }[] = [
  { kind: 'url', pattern: /\b(?:https?:\/\/|www\.)[^\s<>"]+/giu },
  { kind: 'email', pattern: /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu },
  { kind: 'handle', pattern: /(?<![\p{L}\p{N}._%+-])@[\p{L}\p{N}_.]{2,}/gu },
  { kind: 'account', pattern: /\b[A-Z]{2}\d{2}(?:\s?[A-Z\d]{4}){2,7}(?:\s?[A-Z\d]{1,4})?\b/gu },
  { kind: 'phone', pattern: /\+?\d[\d\s().-]{5,}\d/gu },
  {
    kind: 'domain',
    pattern: /\b(?:[\p{L}\p{N}-]+\.)+(?:com|net|org|io|dev|app|ai|co|me|uk|au|nz|de|fr|info)\b/giu,
  },
];

function deriveKey(kind: Token['kind'], raw: string): string {
  const cleaned = raw.normalize('NFC').replace(TRAILING, '');
  if (kind === 'phone' || kind === 'account') {
    return cleaned.replaceAll(/[^\d+A-Z]/gu, '');
  }
  if (kind === 'url') {
    // The scheme and host compare without case; the path keeps its case.
    const match = /^(?<scheme>https?:\/\/)?(?<host>[^/]+)(?<path>.*)$/iu.exec(cleaned);
    const scheme = match?.groups?.scheme ?? '';
    const host = match?.groups?.host ?? '';
    return match
      ? `${scheme.toLowerCase()}${host.toLowerCase()}${match.groups?.path ?? ''}`
      : cleaned;
  }
  return cleaned.toLowerCase();
}

export function findTokens(text: string): Token[] {
  const tokens: Token[] = [];
  const taken: [number, number][] = [];
  for (const entry of PATTERNS) {
    for (const match of text.matchAll(entry.pattern)) {
      const start = match.index;
      const end = start + match[0].length;

      // An email's domain or a URL's host is not a second token.
      const overlaps = taken.some(([from, to]) => start < to && from < end);
      const tooShort = entry.kind === 'phone' && match[0].replaceAll(/\D/gu, '').length < 7;
      if (!overlaps && !tooShort) {
        taken.push([start, end]);
        tokens.push({
          key: deriveKey(entry.kind, match[0]),
          kind: entry.kind,
          raw: match[0].replace(TRAILING, ''),
        });
      }
    }
  }
  return tokens;
}

function isNumberKind(kind: Token['kind']): boolean {
  return kind === 'phone' || kind === 'account';
}

function getHost(token: Token): string {
  if (token.kind === 'email') {
    return token.key.slice(token.key.indexOf('@') + 1);
  }
  if (token.kind === 'url') {
    return token.key.replace(/^https?:\/\//u, '').split('/')[0] ?? '';
  }
  return token.key;
}

// Check 2: every destination-like token in the memory appears in the quote, compared by kind:
// digits only for phone and account numbers, without case for emails, handles, domains and hosts.
export function checkTokens(memory: string, quote: string): Verdict {
  if (INVISIBLE.test(memory)) {
    return { ok: false, reason: 'the memory holds an invisible character' };
  }
  const quoteTokens = findTokens(quote);
  const inQuote = new Set(quoteTokens.map((token) => `${token.kind}:${token.key}`));

  // A phone or account number compares with each number in the quote on its own, so digits from
  // separate numbers never join into one.
  const quoteNumbers = new Set(
    quoteTokens.filter((token) => isNumberKind(token.kind)).map((token) => token.key),
  );

  // A bare domain compares with each host in the quote: a domain, an email's domain or a URL's host.
  const quoteHosts = new Set(quoteTokens.map((token) => getHost(token)));
  const tokens = findTokens(memory);
  for (const token of tokens) {
    const present =
      inQuote.has(`${token.kind}:${token.key}`) ||
      (isNumberKind(token.kind) && quoteNumbers.has(token.key)) ||
      (token.kind === 'domain' && quoteHosts.has(token.key));
    if (!present) {
      return { ok: false, reason: `the ${token.kind} ${token.raw} is not in the quote` };
    }
  }
  return { ok: true, quoteAt: 0, tokens: tokens.map((token) => token.raw) };
}

export function checkWrite(message: OwnerMessage, write: MemoryWrite): Verdict {
  const quote = checkQuote(message, write.quote);
  if (!quote.ok) {
    return quote;
  }
  const tokens = checkTokens(write.memory, write.quote);
  if (!tokens.ok) {
    return tokens;
  }
  return { ok: true, quoteAt: quote.quoteAt, tokens: tokens.tokens };
}
