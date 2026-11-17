export interface TextPage {
  readonly text: string;

  // the offset of the next page, or null when this page reaches the end
  readonly next: number | null;
}

// The cut is measured on the JSON-escaped slice, so quotes, newlines and non-ASCII text count at
// their size on the wire. A page holds at least one code point, so a paging loop always ends.
export function cutTextPage(text: string, offset: number, byteBudget: number): TextPage {
  const encoder = new TextEncoder();

  let end = offset;
  let used = 0;

  while (end < text.length) {
    const point = String.fromCodePoint(text.codePointAt(end) ?? 0);
    const size = encoder.encode(JSON.stringify(point)).length - 2;

    if (end > offset && used + size > byteBudget) {
      break;
    }

    used += size;
    end += point.length;
  }

  return { text: text.slice(offset, end), next: end >= text.length ? null : end };
}
