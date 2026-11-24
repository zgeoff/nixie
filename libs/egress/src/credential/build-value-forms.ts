// A form a scrub cuts: a literal text, or a pattern over the bytes read as latin1.
export type ValueForm = string | RegExp;

// The forms a value takes in a header, a body or an error: as it is, URL-encoded in each way a
// sender writes it, and as base64 at each of the 3 alignments it can take inside a longer base64
// text, standard and URL-safe alike.
export function buildValueForms(value: string): readonly ValueForm[] {
  if (value === '') {
    return [];
  }

  return [value, buildPercentPattern(value), ...buildBase64Patterns(value)];
}

// encodeURIComponent writes upper-case hex and leaves !'()* bare. Another sender writes lower-case
// or mixed-case hex, escapes those 5 characters, or writes a space as a plus.
function buildPercentPattern(value: string): RegExp {
  const parts = encodeURIComponent(value).split(/(?<piece>%[\dA-F]{2}|[!'()*])/u);

  const source = parts
    .map((part) => {
      if (part === '%20') {
        return String.raw`(?:%20|\+)`;
      }

      if (part.startsWith('%')) {
        return `%${buildHexClasses(part.slice(1))}`;
      }

      if (/^[!'()*]$/u.test(part)) {
        const hex = (part.codePointAt(0) ?? 0).toString(16);

        return `(?:${escapePattern(part)}|%${buildHexClasses(hex)})`;
      }

      return escapePattern(part);
    })
    .join('');

  return new RegExp(source, 'gu');
}

function buildHexClasses(hex: string): string {
  return hex.replaceAll(/[\da-f]/giu, (digit) => `[${digit.toLowerCase()}${digit.toUpperCase()}]`);
}

function escapePattern(text: string): string {
  return text.replaceAll(/[$()*+.?[\\\]^{|}]/gu, String.raw`\$&`);
}

const leadingBytes = [0, 1, 2] as const;

// One pattern per alignment. A 6-bit character that the value fills only in part takes a class of
// each character whose known bits match, because the bytes around the value fill the rest.
function buildBase64Patterns(value: string): readonly RegExp[] {
  const bits = [...Buffer.from(value, 'utf8')]
    .map((byte) => byte.toString(2).padStart(8, '0'))
    .join('');

  return leadingBytes.map((prefixBytes) => {
    const start = prefixBytes * 8;
    const first = Math.floor(start / 6);
    const last = Math.floor((start + bits.length - 1) / 6);
    const classes: string[] = [];

    for (let index = first; index <= last; index += 1) {
      classes.push(buildBase64Class(bits, start, index));
    }

    return new RegExp(classes.join(''), 'gu');
  });
}

const base64Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const urlSafeAlphabet = `${base64Alphabet.slice(0, 62)}-_`;

function buildBase64Class(bits: string, start: number, index: number): string {
  const chars = new Set<string>();

  for (let candidate = 0; candidate < 64; candidate += 1) {
    const isMatch = [0, 1, 2, 3, 4, 5].every((position) => {
      const bit = String((candidate >> (5 - position)) & 1);
      const bitIndex = index * 6 + position;

      return (
        bitIndex < start || bits[bitIndex - start] === undefined || bits[bitIndex - start] === bit
      );
    });

    if (isMatch) {
      chars.add(base64Alphabet[candidate] ?? '');
      chars.add(urlSafeAlphabet[candidate] ?? '');
    }
  }

  return `[${[...chars].map((char) => (char === '-' ? String.raw`\-` : char)).join('')}]`;
}
