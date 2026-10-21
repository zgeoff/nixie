import type { SourceSpan } from './writer-types';

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
