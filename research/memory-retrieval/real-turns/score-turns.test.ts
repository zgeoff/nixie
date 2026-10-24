import { expect, test } from 'bun:test';
import { buildRuns, getShippedRun, labelSchema, sampleKeySchema } from './score-turns.ts';

test('#getShippedRun compares rankings against the shipped encoder when another comes first', () => {
  expect(getShippedRun(buildRuns(['bge-small', 'leaf-ir-q8']), 'ranking').name).toBe('leaf-ir-q8 hybrid');
});

test('#getShippedRun compares served sets against the shipped floors', () => {
  expect(getShippedRun(buildRuns(['leaf-ir-q8']), 'served').name).toBe('leaf-ir-q8 served, similarity 0.38, BM25 0.25');
});

test('#buildRuns runs the shipped encoder when the list leaves it out', () => {
  expect(getShippedRun(buildRuns(['minilm']), 'ranking').encoder).toBe('leaf-ir-q8');
});

test('#labelSchema accepts a label with its needed references and best one', () => {
  expect(labelSchema.safeParse({ caseID: 't4', relevant: ['M1', 'M3'], best: 'M3' }).data).toStrictEqual({
    caseID: 't4',
    relevant: ['M1', 'M3'],
    best: 'M3',
  });
});

test('#labelSchema rejects a label whose needed references are one string', () => {
  expect(labelSchema.safeParse({ caseID: 't4', relevant: 'M1', best: 'M1' }).error?.issues).toContainEqual(
    expect.objectContaining({ path: ['relevant'] }),
  );
});

test('#sampleKeySchema accepts a key that maps each reference to an item', () => {
  expect(sampleKeySchema.safeParse({ caseID: 't4', refs: { M1: 'item-a' } }).data).toStrictEqual({
    caseID: 't4',
    refs: { M1: 'item-a' },
  });
});

test('#sampleKeySchema rejects a key whose reference maps to a number', () => {
  expect(sampleKeySchema.safeParse({ caseID: 't4', refs: { M1: 7 } }).error?.issues).toContainEqual(
    expect.objectContaining({ path: ['refs', 'M1'] }),
  );
});
