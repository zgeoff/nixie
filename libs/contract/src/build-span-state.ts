import type { PendingInput, Span, SpanSource, SpanState } from './types';

// Builds the span state once the text box holds `text`. Without a pending input, the edit comes
// from a plain diff and its text counts as unknown. Offsets count UTF-16 code units, and no edit
// boundary splits a surrogate pair.
export function buildSpanState(
  state: SpanState,
  pending: PendingInput | undefined,
  text: string,
): SpanState {
  const edit = planEdit(state.text, text, pending?.selection);
  const source = pending?.source ?? 'unknown';
  const spans = state.spans.flatMap((span) => splitSpan(span, edit));

  if (edit.inserted > 0) {
    spans.push({ end: edit.at + edit.inserted, source, start: edit.at });
  }

  return { spans: mergeSpans(spans), text };
}

interface Edit {
  readonly at: number;
  readonly inserted: number;
  readonly removed: number;
}

// The edit starts at or before the selection's start and ends at or after its end. A backward
// edit ends at the caret, so its suffix is fixed first.
function planEdit(before: string, after: string, selection?: PendingInput['selection']): Edit {
  const shorter = Math.min(before.length, after.length);
  const prefixBound = Math.min(shorter, selection?.start ?? shorter);
  const suffixBound = Math.min(shorter, before.length - (selection?.end ?? 0));

  if (selection?.backward === true) {
    const suffix = countSuffix(before, after, suffixBound);

    return buildEdit(before, after, {
      prefix: countPrefix(before, after, Math.min(prefixBound, shorter - suffix)),
      suffix,
    });
  }

  const prefix = countPrefix(before, after, prefixBound);

  return buildEdit(before, after, {
    prefix,
    suffix: countSuffix(before, after, Math.min(suffixBound, shorter - prefix)),
  });
}

// The count backs off one code unit when it would end inside a surrogate pair.
function countPrefix(before: string, after: string, limit: number): number {
  let length = 0;

  while (length < limit && before[length] === after[length]) {
    length += 1;
  }

  return length > 0 && (isLowSurrogateAt(before, length) || isLowSurrogateAt(after, length))
    ? length - 1
    : length;
}

// The count backs off one code unit when it would start inside a surrogate pair.
function countSuffix(before: string, after: string, limit: number): number {
  let length = 0;

  while (
    length < limit &&
    before[before.length - 1 - length] === after[after.length - 1 - length]
  ) {
    length += 1;
  }

  return length > 0 &&
    (isLowSurrogateAt(before, before.length - length) ||
      isLowSurrogateAt(after, after.length - length))
    ? length - 1
    : length;
}

// codePointAt returns a low surrogate's own value, because the surrogate does not start a pair.
function isLowSurrogateAt(text: string, index: number): boolean {
  const code = text.codePointAt(index) ?? 0;

  return code >= 0xdc_00 && code <= 0xdf_ff;
}

interface Shared {
  readonly prefix: number;
  readonly suffix: number;
}

// The edit is whatever lies between the prefix and the suffix that both texts share.
function buildEdit(before: string, after: string, shared: Shared): Edit {
  return {
    at: shared.prefix,
    inserted: after.length - shared.prefix - shared.suffix,
    removed: before.length - shared.prefix - shared.suffix,
  };
}

// Shifts a span past the edit, trims the part the edit removed, and splits a span the edit lands
// inside.
function splitSpan(span: Readonly<Span>, edit: Edit): Span[] {
  const removedEnd = edit.at + edit.removed;
  const shift = edit.inserted - edit.removed;

  if (span.end <= edit.at) {
    return [span];
  }
  if (span.start >= removedEnd) {
    return [{ ...span, end: span.end + shift, start: span.start + shift }];
  }

  const head = span.start < edit.at ? [{ ...span, end: edit.at }] : [];
  const tail =
    span.end > removedEnd
      ? [{ ...span, end: span.end + shift, start: edit.at + edit.inserted }]
      : [];

  return [...head, ...tail];
}

// Joins neighbouring spans from the same source and drops empty ones.
function mergeSpans(spans: readonly Span[]): Span[] {
  const merged: { end: number; source: SpanSource; start: number }[] = [];

  for (const span of spans.toSorted((left, right) => left.start - right.start)) {
    const last = merged.at(-1);

    if (last?.source === span.source && last.end === span.start) {
      last.end = span.end;
    } else if (span.end > span.start) {
      merged.push({ ...span });
    }
  }

  return merged;
}
