/* oxlint-disable one-var, max-statements -- the span arithmetic reads better one value per statement */
// Tracks which spans of a message the owner typed and which arrived another way. The core works on
// 2 strings and the selection, so the web client and a React Native text input can share it.
export type SpanSource = 'dropped' | 'pasted' | 'typed' | 'unknown';

export interface Span {
  end: number;
  source: SpanSource;
  start: number;
}

export interface Edit {
  at: number;
  inserted: number;
  removed: number;
}

export interface Selection {
  backward: boolean;
  end: number;
  start: number;
}

function countPrefix(before: string, after: string, limit: number): number {
  let length = 0;
  while (length < limit && before[length] === after[length]) {
    length += 1;
  }
  return length;
}

function countSuffix(before: string, after: string, limit: number): number {
  let length = 0;
  while (
    length < limit &&
    before[before.length - 1 - length] === after[after.length - 1 - length]
  ) {
    length += 1;
  }
  return length;
}

// The edit starts at or before the selection's start and ends at or after its end. A backward
// delete ends at the caret, so its suffix is fixed first.
export function findEdit(before: string, after: string, selection?: Selection): Edit {
  const shorter = Math.min(before.length, after.length);
  const prefixBound = Math.min(shorter, selection?.start ?? shorter);
  const selectionTail = before.length - (selection?.end ?? 0);
  const suffixBound = Math.min(shorter, selectionTail);
  let prefix = 0;
  let suffix = 0;
  if (selection?.backward) {
    suffix = countSuffix(before, after, suffixBound);
    prefix = countPrefix(before, after, Math.min(prefixBound, shorter - suffix));
  } else {
    prefix = countPrefix(before, after, prefixBound);
    suffix = countSuffix(before, after, Math.min(suffixBound, shorter - prefix));
  }
  return {
    at: prefix,
    inserted: after.length - prefix - suffix,
    removed: before.length - prefix - suffix,
  };
}

function transformSpan(span: Span, edit: Edit): Span[] {
  const removedEnd = edit.at + edit.removed;
  const delta = edit.inserted - edit.removed;
  if (span.end <= edit.at) {
    return [span];
  }
  if (span.start >= removedEnd) {
    return [{ ...span, end: span.end + delta, start: span.start + delta }];
  }
  const pieces: Span[] = [];
  if (span.start < edit.at) {
    pieces.push({ ...span, end: edit.at });
  }
  if (span.end > removedEnd) {
    pieces.push({ ...span, end: span.end + delta, start: edit.at + edit.inserted });
  }
  return pieces;
}

function mergeSpans(spans: Span[]): Span[] {
  const merged: Span[] = [];
  for (const span of spans.toSorted((left, right) => left.start - right.start)) {
    const last = merged.at(-1);
    if (last && last.source === span.source && last.end === span.start) {
      last.end = span.end;
    } else if (span.end > span.start) {
      merged.push({ ...span });
    }
  }
  return merged;
}

export function applyEdit(spans: Span[], edit: Edit, source: SpanSource): Span[] {
  const shifted = spans.flatMap((span) => transformSpan(span, edit));
  if (edit.inserted > 0) {
    shifted.push({ end: edit.at + edit.inserted, source, start: edit.at });
  }
  return mergeSpans(shifted);
}

// Maps a browser InputEvent.inputType to a source. Anything unlisted, undo and redo included,
// counts as unknown, so evidence under 0011 needs an affirmative typed.
export function getSourceForInputType(inputType: string): SpanSource {
  if (inputType === 'insertFromPaste' || inputType === 'insertFromPasteAsQuotation') {
    return 'pasted';
  }
  if (inputType === 'insertFromDrop') {
    return 'dropped';
  }
  if (
    ['insertText', 'insertCompositionText', 'insertLineBreak', 'insertReplacementText'].includes(
      inputType,
    )
  ) {
    return 'typed';
  }
  return 'unknown';
}

export function getSpanText(text: string, spans: Span[]): string[] {
  return spans.map((span) => `${span.source}:${JSON.stringify(text.slice(span.start, span.end))}`);
}
