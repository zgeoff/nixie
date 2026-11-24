import { buildLiteralPattern } from './build-literal-pattern';
import type { ValueForm } from './build-value-forms';

export const removedMarker = '[secret removed]';

// Replaces each occurrence of any form with the marker. Where 2 forms start at the same place, the
// longer match is cut whole.
export function scrubBytes(bytes: Uint8Array, forms: readonly ValueForm[]): Uint8Array {
  const needles = forms
    .filter((form) => form !== '')
    .map((form) => (typeof form === 'string' ? buildLiteralPattern(form) : form))
    .map((form) => makeGlobal(form));

  const marker = Buffer.from(removedMarker, 'utf8');
  const source = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // latin1 reads each byte as one character, so an index into the text is an index into the bytes
  const text = source.toString('latin1');
  const parts: Buffer[] = [];
  let position = 0;

  while (position < source.length) {
    const found = findNearest(text, needles, position);

    if (found === null) {
      break;
    }

    parts.push(source.subarray(position, found.index), marker);

    position = found.index + found.length;
  }

  if (parts.length === 0) {
    return bytes;
  }

  parts.push(source.subarray(position));

  return Buffer.concat(parts);
}

function makeGlobal(pattern: RegExp): RegExp {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;

  return new RegExp(pattern.source, flags);
}

function findNearest(
  text: string,
  needles: readonly RegExp[],
  from: number,
): { readonly index: number; readonly length: number } | null {
  let nearest: { index: number; length: number } | null = null;

  for (const needle of needles) {
    needle.lastIndex = from;

    const match = needle.exec(text);

    if (match === null || match[0] === '') {
      continue;
    }

    const isBetter =
      nearest === null ||
      match.index < nearest.index ||
      (match.index === nearest.index && match[0].length > nearest.length);

    if (isBetter) {
      nearest = { index: match.index, length: match[0].length };
    }
  }

  return nearest;
}
