// a mapped type, because a tool's JSON result needs the index signature an interface lacks; part is
// the number of the part the match starts in, from 1
export type PageMatch = Readonly<{ part: number; snippet: string }>;

const matchLimit = 10;

// The search folds case inside the pattern, never by lowercasing the text: a lowercased İ grows to
// two code units, which would move every later match and pick the wrong part.
export function collectPageMatches(parts: readonly string[], query: string): PageMatch[] {
  const text = parts.join('');
  const partEnds = collectPartEnds(parts);

  const pattern = new RegExp(RegExp.escape(query), 'giu');

  return text
    .matchAll(pattern)
    .take(matchLimit)
    .map((match) => ({
      part: partEnds.findIndex((end) => match.index < end) + 1,
      snippet: formatSnippet(text, match.index, match.index + match[0].length),
    }))
    .toArray();
}

function collectPartEnds(parts: readonly string[]): number[] {
  let end = 0;

  return parts.map((part) => {
    end += part.length;

    return end;
  });
}

const snippetContextChars = 50;

function formatSnippet(text: string, matchStart: number, matchEnd: number): string {
  const start = moveOffSurrogate(text, Math.max(0, matchStart - snippetContextChars), -1);
  const end = moveOffSurrogate(text, Math.min(text.length, matchEnd + snippetContextChars), 1);

  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}

// a position between the two halves of a surrogate pair moves one code unit outward, so the
// snippet never holds half a character
function moveOffSurrogate(text: string, position: number, step: -1 | 1): number {
  const unit = text.codePointAt(position) ?? 0;

  return unit >= 0xdc_00 && unit <= 0xdf_ff && position > 0 && position < text.length
    ? position + step
    : position;
}
