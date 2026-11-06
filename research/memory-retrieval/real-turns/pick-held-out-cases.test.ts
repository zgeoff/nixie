import { expect, test } from 'bun:test';
import { pickHeldOutCases } from './pick-held-out-cases.ts';

test('it keeps each turn in its half when another turn joins the set', () => {
  const caseIDs = Array.from({ length: 40 }, (_, position) => `t${position * 7 + 3}`);

  const before = pickHeldOutCases(caseIDs, 4716);
  const after = pickHeldOutCases(['t1', ...caseIDs], 4716);

  expect([...after].filter((caseID) => caseID !== 't1')).toStrictEqual([...before]);
});

test('it holds out some turns and keeps the rest for selection', () => {
  const caseIDs = Array.from({ length: 40 }, (_, position) => `t${position * 7 + 3}`);

  expect(pickHeldOutCases(caseIDs, 4716).size).toBeWithin(10, 31);
});
