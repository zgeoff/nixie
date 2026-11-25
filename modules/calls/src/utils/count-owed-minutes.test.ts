import { expect, test } from 'bun:test';
import type { Call } from '../types';
import { countOwedMinutes } from './count-owed-minutes';

function setupTest() {
  return {
    buildCall: (overrides: Partial<Call>): Call => ({
      callID: 'c1',
      taskID: 't1',
      state: 'live',
      startedBy: 'you',
      carryingSession: 'identity-1',
      startedAtMs: 0,
      connectedAtMs: 0,
      endedAtMs: null,
      endedBy: null,
      minutes: 1,
      ...overrides,
    }),
  };
}

test.each([
  { name: 'a live call 59 s in owes nothing', overrides: {}, nowMs: 59_999, owed: 0 },
  { name: 'a live call 60 s in owes its second minute', overrides: {}, nowMs: 60_000, owed: 1 },
  { name: 'a live call 150 s in owes 2 minutes', overrides: {}, nowMs: 150_000, owed: 2 },
  {
    name: 'a connecting call owes nothing',
    overrides: { state: 'connecting', connectedAtMs: null, minutes: 0 },
    nowMs: 90_000,
    owed: 0,
  },
  {
    name: 'an ended call owes nothing',
    overrides: { state: 'ended' },
    nowMs: 90_000,
    owed: 0,
  },
] as const)('#countOwedMinutes counts $name', (row) => {
  const ctx = setupTest();

  expect(countOwedMinutes(ctx.buildCall(row.overrides), row.nowMs)).toBe(row.owed);
});
