export const removedMarker = '[secret removed]';

// Replaces each occurrence of any form with the marker, longest form first so a form that holds
// another is cut whole.
export function scrubBytes(bytes: Uint8Array, forms: readonly string[]): Uint8Array {
  const needles = [...forms]
    .toSorted((left, right) => right.length - left.length)
    .map((form) => Buffer.from(form, 'utf8'));

  const marker = Buffer.from(removedMarker, 'utf8');
  const source = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const parts: Buffer[] = [];
  let position = 0;

  while (position < source.length) {
    const found = findNearest(source, needles, position);

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

function findNearest(
  source: Buffer,
  needles: readonly Buffer[],
  from: number,
): { readonly index: number; readonly length: number } | null {
  let nearest: { index: number; length: number } | null = null;

  for (const needle of needles) {
    const index = source.indexOf(needle, from);

    if (index !== -1 && (nearest === null || index < nearest.index)) {
      nearest = { index, length: needle.length };
    }
  }

  return nearest;
}
