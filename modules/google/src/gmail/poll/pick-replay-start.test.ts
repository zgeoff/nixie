import { expect, test } from 'bun:test';
import { pickReplayStart } from './pick-replay-start';

test.each([
  { title: 'no rule', rules: [], replayed: [], expected: null },
  {
    title: 'a rule that was replayed',
    rules: [{ ruleID: 'a', createdAt: 5 }],
    replayed: ['a'],
    expected: null,
  },
  {
    title: 'a rule that was not replayed',
    rules: [{ ruleID: 'a', createdAt: 5 }],
    replayed: [],
    expected: 5,
  },
  {
    title: 'the earliest of the rules that were not replayed',
    rules: [
      { ruleID: 'a', createdAt: 5 },
      { ruleID: 'b', createdAt: 3 },
      { ruleID: 'c', createdAt: 1 },
    ],
    replayed: ['c'],
    expected: 3,
  },
])('#pickReplayStart picks $expected for $title', (row) => {
  expect(pickReplayStart(row.rules, row.replayed)).toBe(row.expected);
});
