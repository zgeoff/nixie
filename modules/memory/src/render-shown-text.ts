import type { SourceSpan } from './writer-types';

// Renders your message as the writer reads it, with each span the client did not label typed, such
// as a paste, wrapped in ⟦ ⟧. A message with no spans recorded shows as it is.
export function renderShownText(text: string, spans: readonly SourceSpan[]): string {
  if (spans.length === 0) {
    return text;
  }
  return spans
    .toSorted((left, right) => left.start - right.start)
    .map((span) => {
      const part = text.slice(span.start, span.end);

      return span.source === 'typed' ? part : `⟦${part}⟧`;
    })
    .join('');
}
