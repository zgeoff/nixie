import type { Span, SpanState } from '@heynixie/contract';

// Whitespace inside a pasted block is content, so the trim stops at the edge of the first and last
// pasted block. Typed text has no such edge: the trim cuts it and its span shrinks to match.
export function buildTrimmedMessage(message: SpanState): SpanState {
  if (message.text.trim() === '') {
    return { spans: [], text: '' };
  }

  const pasted = message.spans.filter((span) => span.source === 'pasted');
  const firstPastedStart = Math.min(...pasted.map((span) => span.start));
  const lastPastedEnd = Math.max(...pasted.map((span) => span.end));
  const start = Math.min(message.text.length - message.text.trimStart().length, firstPastedStart);
  const end = Math.max(message.text.trimEnd().length, lastPastedEnd);

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
