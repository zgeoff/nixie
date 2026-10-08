/* oxlint-disable one-var -- the replay keeps its state in 2 lets */
import { expect, test } from 'bun:test';
import type { Span, SpanSource } from './spans.ts';
import { applyEdit, findEdit, getSpanText } from './spans.ts';

interface Step {
  after: string;
  caret?: number;
  source: SpanSource;
}

function runSteps(steps: Step[]): string[] {
  let spans: Span[] = [];
  let text = '';
  for (const step of steps) {
    spans = applyEdit(spans, findEdit(text, step.after, step.caret), step.source);
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
      { after: 'PASxTED', caret: 3, source: 'typed' },
    ]),
  ).toEqual(['pasted:"PAS"', 'typed:"x"', 'pasted:"TED"']);
});

test('a paste next to repeated text, with and without the caret', () => {
  const steps: Step[] = [
    { after: 'ab', source: 'typed' },
    { after: 'abab', caret: 1, source: 'pasted' },
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
      { after: 'helXTED', caret: 3, source: 'typed' },
    ]),
  ).toEqual(['typed:"helX"', 'pasted:"TED"']);
});
