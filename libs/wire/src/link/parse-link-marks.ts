// One run of a fetched page's text: plain text, or the mark of the link with that index in the
// reply's links.
export type MarkedTextPart = string | { readonly link: number };

// Parses a fetched page's text into its runs of plain text and its link marks. The text limit can
// cut the last mark short, so a mark that never closes is dropped with any stray mark character.
export function parseLinkMarks(text: string): readonly MarkedTextPart[] {
  const parts: MarkedTextPart[] = [];
  let start = 0;

  for (const match of text.matchAll(/\u{E000}(?<index>\d+)\u{E001}/gu)) {
    pushText(parts, text.slice(start, match.index));

    parts.push({ link: Number(match.groups?.['index']) });

    start = match.index + match[0].length;
  }

  pushText(parts, text.slice(start).replace(/\u{E000}\d*$/u, ''));

  return parts;
}

function pushText(parts: MarkedTextPart[], text: string): void {
  const plain = text.replaceAll(/[\u{E000}\u{E001}]/gu, '');

  if (plain !== '') {
    parts.push(plain);
  }
}
