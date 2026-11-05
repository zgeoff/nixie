import { expect, test } from 'bun:test';
import { pickPooledRuns } from './pick-pooled-runs.ts';
import { buildRuns } from './score-turns.ts';

test.each([
  'leaf-ir-q8 served, similarity 0.46, BM25 2',
  'leaf-ir-q8 served, BM25 x2',
  'leaf-ir-q8 served, hub floor 0',
  'leaf-ir-q8 served, window 1',
  'leaf-ir-q8 served, previous exchange on every turn',
  'leaf-ir-q8 served, shipped floors, 3 items',
  'leaf-ir-q8 served, short skip, 3 words',
  'leaf-ir-q8 served, pasted text dropped',
])('it pools the compared served setting %s', (name) => {
  const pooled = pickPooledRuns(buildRuns(['leaf-ir-q8']));

  expect(pooled.map((run) => run.name)).toContain(name);
});

test('it leaves out each ranking setting other than the shipped one', () => {
  const pooled = pickPooledRuns(buildRuns(['leaf-ir-q8']));

  expect(pooled.filter((run) => run.kind === 'ranking').map((run) => run.name)).toStrictEqual(['leaf-ir-q8 hybrid']);
});
