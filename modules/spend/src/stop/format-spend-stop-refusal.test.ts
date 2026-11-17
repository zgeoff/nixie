import { expect, test } from 'bun:test';
import { buildTrippedStop } from '../test-utils';
import { formatSpendStopRefusal } from './format-spend-stop-refusal';

test.each([
  { name: 'a day trip', stop: buildTrippedStop(), text: "when you raise today's limit" },
  {
    name: 'a month trip',
    stop: buildTrippedStop({ period: 'month' }),
    text: "raises the month's limit",
  },
  { name: 'an unreachable gateway', stop: { state: 'unreachable' }, text: 'does not answer' },
  { name: 'the lost mark', stop: { state: 'lost' }, text: 'removes the lost mark' },
] as const)('it says how $name clears', (row) => {
  expect(formatSpendStopRefusal(row.stop)).toContain(row.text);
});
