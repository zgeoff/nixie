import type { Span, SpanState } from '@heynixie/contract';

// Whitespace inside a block that came from outside the keyboard (pasted, dropped or unknown) is
// content, so the trim stops at the edge of the first and last such block and never clips or drops
// one. Typed text has no such edge: the trim cuts it and its span shrinks to match.
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
