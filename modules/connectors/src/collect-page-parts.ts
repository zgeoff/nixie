import type { LinkedText, TagSpan } from './render-linked-text';

export function collectPageParts(linked: LinkedText, limitBytes: number): string[] {
  const text = linked.text;
  const parts: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = pickPartEnd(linked, start, limitBytes);

    if (end === start) {
      // only a character wider than a whole part ends here, and no part can hold it
      start += (text.codePointAt(start) ?? 0) > 0xff_ff ? 2 : 1;
      continue;
    }

    parts.push(text.slice(start, end));

    start = end;
  }

  return parts.length === 0 ? [''] : parts;
}

function pickPartEnd(linked: LinkedText, start: number, limitBytes: number): number {
  const text = linked.text;
  const fittingEnd = start + countFittingUnits(text, start, limitBytes);

  if (fittingEnd === text.length) {
    return fittingEnd;
  }

  const spanned = findTagAt(linked.tags, fittingEnd);
  const end = spanned === null ? fittingEnd : spanned.start;

  if (end === start) {
    return end;
  }

  return findLastBreak(linked, '\n', start, end) ?? findLastBreak(linked, ' ', start, end) ?? end;
}

// a character takes at least one byte per code unit, so the slice holds every unit that can fit,
// and the encoder stops before a character whose bytes would pass the limit
function countFittingUnits(text: string, start: number, limitBytes: number): number {
  return new TextEncoder().encodeInto(
    text.slice(start, start + limitBytes),
    new Uint8Array(limitBytes),
  ).read;
}

function findTagAt(tags: readonly TagSpan[], position: number): TagSpan | null {
  let low = 0;
  let high = tags.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const tag = tags[middle];

    if (tag === undefined || position < tag.start) {
      high = middle - 1;
    } else if (position >= tag.end) {
      low = middle + 1;
    } else {
      return tag;
    }
  }

  return null;
}

function findLastBreak(
  linked: LinkedText,
  character: string,
  start: number,
  end: number,
): number | null {
  let position = linked.text.lastIndexOf(character, end - 1);

  while (position >= start) {
    const tag = findTagAt(linked.tags, position);

    if (tag === null) {
      return position + 1;
    }

    position = linked.text.lastIndexOf(character, tag.start - 1);
  }

  return null;
}
