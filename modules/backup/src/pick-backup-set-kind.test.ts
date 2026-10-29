import { expect, test } from 'bun:test';
import { pickBackupSetKind } from './pick-backup-set-kind';

test.each([
  ['no set yet', { isForgetDue: false, isSetWaiting: false, newestStagedAt: null }, 'scheduled'],
  [
    'a set an interval old',
    { isForgetDue: false, isSetWaiting: false, newestStagedAt: 0 },
    'scheduled',
  ],
  [
    'a set less than an interval old',
    { isForgetDue: false, isSetWaiting: false, newestStagedAt: 1 },
    null,
  ],
  ['a set waiting to ship', { isForgetDue: false, isSetWaiting: true, newestStagedAt: 0 }, null],
  [
    'a forget beside a set waiting to ship',
    { isForgetDue: true, isSetWaiting: true, newestStagedAt: 1 },
    'forget',
  ],
  [
    'a forget after a fresh set',
    { isForgetDue: true, isSetWaiting: false, newestStagedAt: 1 },
    'forget',
  ],
] as const)('it picks for %s', (_label, due, expected) => {
  expect(pickBackupSetKind(due, 3_600_000, 3_600_000)).toBe(expected);
});
