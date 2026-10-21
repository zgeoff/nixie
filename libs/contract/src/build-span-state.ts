import type { PendingInput, Span, SpanSource, SpanState } from './types';

export function buildSpanState(
  state: SpanState,
  pending: PendingInput | undefined,
  text: string,
): SpanState {
  const pinned = planEdit(state.text, text, pending?.selection);
  const fallback = pending === undefined || !isEditAtSelection(pinned, pending.selection);
  const edit = fallback ? planEdit(state.text, text) : pinned;

  const source = fallback
    ? 'unknown'
    : pickEditSource(state.removed, pending, {
        at: edit.at,
        removed: edit.removed,
        text: text.slice(edit.at, edit.at + edit.inserted),
      });

  const spans = state.spans.flatMap((span) => splitSpan(span, edit));

  if (edit.inserted > 0) {
    spans.push({ end: edit.at + edit.inserted, source, start: edit.at });
  }

  const removed = fallback ? undefined : findTypedRemoval(state, edit);

  return removed === undefined
    ? { spans: mergeSpans(spans), text }
    : { removed, spans: mergeSpans(spans), text };
}

interface Edit {
  readonly at: number;
  readonly inserted: number;
  readonly removed: number;
}

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

function buildEdit(before: string, after: string, shared: Shared): Edit {
  return {
    at: shared.prefix,
    inserted: after.length - shared.prefix - shared.suffix,
    removed: before.length - shared.prefix - shared.suffix,
  };
}

function countPrefix(before: string, after: string, limit: number): number {
  let length = 0;

  while (length < limit && before[length] === after[length]) {
    length += 1;
  }

  return length > 0 && (isLowSurrogateAt(before, length) || isLowSurrogateAt(after, length))
    ? length - 1
    : length;
}

function isEditAtSelection(edit: Edit, selection: PendingInput['selection']): boolean {
  return (
    edit.inserted === 0 || (edit.at === selection.start && edit.at + edit.removed === selection.end)
  );
}

interface Insertion {
  readonly at: number;
  readonly removed: number;
  readonly text: string;
}

function pickEditSource(
  removed: SpanState['removed'],
  pending: PendingInput,
  insertion: Insertion,
): SpanSource {
  const respacing = pending.respacing;

  const isRespaced =
    respacing !== undefined &&
    removed !== undefined &&
    insertion.at === removed.at &&
    insertion.removed === 0 &&
    insertion.text === respacing &&
    stripWhitespace(respacing) === stripWhitespace(removed.text);

  return isRespaced ? 'typed' : pending.source;
}

function stripWhitespace(text: string): string {
  return text.replaceAll(/\s/gu, '');
}

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

function findTypedRemoval(state: SpanState, edit: Edit): SpanState['removed'] {
  const end = edit.at + edit.removed;

  const isTyped = state.spans.some(
    (span) => span.source === 'typed' && span.start <= edit.at && end <= span.end,
  );

  return edit.inserted === 0 && edit.removed > 0 && isTyped
    ? { at: edit.at, text: state.text.slice(edit.at, end) }
    : undefined;
}

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
