/* oxlint-disable one-var -- the replay keeps its state in 2 lets */
import { expect, test } from 'bun:test';
import type { Selection, Span, SpanSource } from './spans.ts';
import { applyEdit, findEdit, getSpanText } from './spans.ts';

interface Step {
  after: string;
  selection?: Selection;
  source: SpanSource;
}

function getCaret(at: number, backward = false): Selection {
  return { backward, end: at, start: at };
}

function runSteps(steps: Step[]): string[] {
  let spans: Span[] = [];
  let text = '';
  for (const step of steps) {
    spans = applyEdit(spans, findEdit(text, step.after, step.selection), step.source);
    text = step.after;
  }
  return getSpanText(text, spans);
}

test('typed, pasted and typed again', () => {
  expect(
    runSteps([
      { after: 'hello ', source: 'typed' },
      { after: 'hello PASTED', source: 'pasted' },
      { after: 'hello PASTED world', source: 'typed' },
    ]),
  ).toEqual(['typed:"hello "', 'pasted:"PASTED"', 'typed:" world"']);
});

test('typing inside a pasted span splits it', () => {
  expect(
    runSteps([
      { after: 'PASTED', source: 'pasted' },
      { after: 'PASxTED', selection: getCaret(3), source: 'typed' },
    ]),
  ).toEqual(['pasted:"PAS"', 'typed:"x"', 'pasted:"TED"']);
});

test('a paste next to repeated text, with and without the caret', () => {
  const steps: Step[] = [
    { after: 'ab', source: 'typed' },
    { after: 'abab', selection: getCaret(1), source: 'pasted' },
  ];
  expect(runSteps(steps)).toEqual(['typed:"a"', 'pasted:"ba"', 'typed:"b"']);
  expect(runSteps(steps.map((step) => ({ after: step.after, source: step.source })))).toEqual([
    'typed:"ab"',
    'pasted:"ab"',
  ]);
});

test('a replacement over a boundary keeps the untouched parts', () => {
  expect(
    runSteps([
      { after: 'hello ', source: 'typed' },
      { after: 'hello PASTED', source: 'pasted' },
      { after: 'helXTED', selection: { backward: false, end: 9, start: 3 }, source: 'typed' },
    ]),
  ).toEqual(['typed:"helX"', 'pasted:"TED"']);
});

test('a paste over a selection labels the whole paste', () => {
  expect(
    runSteps([
      { after: 'cat', source: 'typed' },
      { after: 'bat', selection: { backward: false, end: 3, start: 0 }, source: 'pasted' },
    ]),
  ).toEqual(['pasted:"bat"']);
});

test('a backspace between a typed and a pasted character removes the typed one', () => {
  expect(
    runSteps([
      { after: 'a', source: 'typed' },
      { after: 'aa', source: 'pasted' },
      { after: 'a', selection: getCaret(1, true), source: 'unknown' },
    ]),
  ).toEqual(['pasted:"a"']);
});

test('a forward delete between a typed and a pasted character removes the pasted one', () => {
  expect(
    runSteps([
      { after: 'a', source: 'typed' },
      { after: 'aa', source: 'pasted' },
      { after: 'a', selection: getCaret(1), source: 'unknown' },
    ]),
  ).toEqual(['typed:"a"']);
});
