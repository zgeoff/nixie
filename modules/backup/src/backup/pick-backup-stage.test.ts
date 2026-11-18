import { expect, test } from 'bun:test';
import { pickBackupStage } from './pick-backup-stage';

test.each([
  [
    'no set held and no forget due',
    { isForgetDue: false, isSetWaiting: false, newestStagedAt: 1 },
    null,
    { status: 'stage', kind: 'scheduled' },
  ],
  [
    'a forget due',
    { isForgetDue: true, isSetWaiting: false, newestStagedAt: 1 },
    null,
    { status: 'stage', kind: 'forget' },
  ],
  [
    'a set held',
    { isForgetDue: false, isSetWaiting: true, newestStagedAt: 1 },
    4,
    { status: 'set_waiting', sequence: 4 },
  ],
  [
    'a forget due beside a set held',
    { isForgetDue: true, isSetWaiting: true, newestStagedAt: 1 },
    4,
    { status: 'set_waiting', sequence: 4 },
  ],
] as const)('it picks for %s', (_label, due, held, expected) => {
  expect(pickBackupStage(due, held)).toStrictEqual(expected);
});
