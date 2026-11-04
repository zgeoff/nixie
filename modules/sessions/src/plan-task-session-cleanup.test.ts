import { expect, test } from 'bun:test';
import { planTaskSessionCleanup } from './plan-task-session-cleanup';

test.each([
  ['an opened session in a sandbox', true, true, { isInvalidated: true, isPurged: true }],
  [
    'an opened session whose sandbox is gone',
    true,
    false,
    { isInvalidated: true, isPurged: false },
  ],
  ['no session yet in a sandbox', false, true, { isInvalidated: false, isPurged: true }],
  ['no session and no sandbox', false, false, { isInvalidated: false, isPurged: false }],
] as const)('it plans the cleanup of a task with %s', (_case, isOpened, hasSandbox, plan) => {
  expect(planTaskSessionCleanup({ isOpened, hasSandbox })).toStrictEqual(plan);
});
