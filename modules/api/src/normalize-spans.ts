import type { Span } from '@heynixie/contract';

// Spans that run from 0 to the text's end in order, each non-empty, with no gap or overlap, are kept
// as sent. Anything else makes the whole message one unknown span, so a client that cannot tell
// fails closed. Offsets count UTF-16 code units, as the text's length does.
interface NormalizedSpans {
  readonly spans: readonly Span[];
  readonly labelled: 'as_sent' | 'unknown';
}

export function normalizeSpans(text: string, spans: readonly Span[]): NormalizedSpans {
  if (isSpanCover(text, spans)) {
    return { spans, labelled: 'as_sent' };
  }
  return { spans: [{ start: 0, end: text.length, source: 'unknown' }], labelled: 'unknown' };
}

function isSpanCover(text: string, spans: readonly Span[]): boolean {
  if (spans.length === 0) {
    return false;
  }
  const covered = spans.reduce<number | null>(
    (end, span) => (end === span.start && span.end > span.start ? span.end : null),
    0,
  );

  return covered === text.length;
}
