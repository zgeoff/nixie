import type { Span } from '@heynixie/contract';

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

  // Span offsets count UTF-16 code units, as a JavaScript string's length does.
  return covered === text.length;
}
