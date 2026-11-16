import { expect, test } from 'bun:test';
import { pickTurnOutcome } from './pick-turn-outcome';

test.each([
  { status: 'completed', hasLimitInterrupt: false, hasHostInterrupt: false, expected: 'finished' },
  { status: 'completed', hasLimitInterrupt: true, hasHostInterrupt: false, expected: 'finished' },
  { status: 'interrupted', hasLimitInterrupt: true, hasHostInterrupt: false, expected: 'limit' },
  {
    status: 'interrupted',
    hasLimitInterrupt: false,
    hasHostInterrupt: true,
    expected: 'interrupted',
  },
  {
    status: 'interrupted',
    hasLimitInterrupt: true,
    hasHostInterrupt: true,
    expected: 'interrupted',
  },
  {
    status: 'interrupted',
    hasLimitInterrupt: false,
    hasHostInterrupt: false,
    expected: 'interrupted',
  },
] as const)(
  'it ends a $status turn as $expected when the guest interrupted for the limit: $hasLimitInterrupt and for the host: $hasHostInterrupt',
  (row) => {
    const outcome = pickTurnOutcome({
      status: row.status,
      hasLimitInterrupt: row.hasLimitInterrupt,
      hasHostInterrupt: row.hasHostInterrupt,
    });

    expect(outcome).toBe(row.expected);
  },
);
