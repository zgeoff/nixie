import type { Span, SpanState } from '@heynixie/contract';

// Whitespace in a pasted, dropped or unknown block is content the user brought in, so the trim stops
// at those blocks' edges. Typed whitespace is trimmed, and a typed span left empty goes.
export function buildTrimmedMessage(message: SpanState): SpanState {
  if (message.text.trim() === '') {
    return { spans: [], text: '' };
  }

  const blocks = message.spans.filter((span) => span.source !== 'typed');
  const firstBlockStart = Math.min(...blocks.map((span) => span.start));
  const lastBlockEnd = Math.max(...blocks.map((span) => span.end));
  const start = Math.min(message.text.length - message.text.trimStart().length, firstBlockStart);
  const end = Math.max(message.text.trimEnd().length, lastBlockEnd);

  return {
    spans: message.spans.flatMap((span) => toShiftedSpan(span, start, end)),
    text: message.text.slice(start, end),
  };
}

function toShiftedSpan(span: Span, start: number, end: number): Span[] {
  const shifted = {
    ...span,
    end: Math.min(span.end, end) - start,
    start: Math.max(span.start, start) - start,
  };

  return shifted.end > shifted.start ? [shifted] : [];
}
