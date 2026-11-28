import { expect, test } from 'bun:test';
import { collectCleanedCauses } from './collect-cleaned-causes';

test('it returns the start calls of a record forget before the record itself', () => {
  expect(collectCleanedCauses({ recordSequence: 9, callSequences: [4, 5] })).toStrictEqual([
    { recordSequence: 4 },
    { recordSequence: 5 },
    { recordSequence: 9 },
  ]);
});

test('it returns the record alone when it has no start call', () => {
  expect(collectCleanedCauses({ recordSequence: 9 })).toStrictEqual([{ recordSequence: 9 }]);
});

test('it returns no cause for the reset of a thread', () => {
  expect(collectCleanedCauses({ thread: 'conversation' })).toStrictEqual([]);
});

test('it returns a note cause as it is', () => {
  expect(collectCleanedCauses({ noteID: 'n1' })).toStrictEqual([{ noteID: 'n1' }]);
});
