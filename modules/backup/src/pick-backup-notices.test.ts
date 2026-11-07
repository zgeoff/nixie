import { expect, test } from 'bun:test';
import type { RaisedNotice } from './pick-backup-notices';
import { pickBackupNotices } from './pick-backup-notices';

test('it raises a failed notice for a set whose receipt failed', () => {
  const notices = pickBackupNotices(
    [{ sequence: 3, state: 'failed', staged_at: 1_798_761_600_000 }],
    [],
    1_798_761_700_000,
    3_600_000,
  );

  expect(notices).toStrictEqual([{ sequence: 3, cause: 'failed' }]);
});

test.each<[string, number, RaisedNotice[]]>([
  ['raises a missing notice', 3_600_000, [{ sequence: 3, cause: 'missing' }]],
  ['raises nothing', 3_599_999, []],
])('it %s for a set that has waited %d ms on a 1 h interval', (_outcome, waitedMs, expected) => {
  const notices = pickBackupNotices(
    [{ sequence: 3, state: 'staged', staged_at: 1_798_761_600_000 }],
    [],
    1_798_761_600_000 + waitedMs,
    3_600_000,
  );

  expect(notices).toStrictEqual(expected);
});

test('it raises nothing for a set still staging, however long it has waited', () => {
  const notices = pickBackupNotices(
    [{ sequence: 3, state: 'staging', staged_at: 1_798_761_600_000 }],
    [],
    1_798_772_400_000,
    3_600_000,
  );

  expect(notices).toStrictEqual([]);
});

test('it raises nothing for a cause a set has already raised', () => {
  const notices = pickBackupNotices(
    [{ sequence: 3, state: 'failed', staged_at: 1_798_761_600_000 }],
    [{ sequence: 3, cause: 'failed' }],
    1_798_761_700_000,
    3_600_000,
  );

  expect(notices).toStrictEqual([]);
});

test('it raises a failed notice for a set that raised a missing notice before its receipt failed', () => {
  const notices = pickBackupNotices(
    [{ sequence: 3, state: 'failed', staged_at: 1_798_761_600_000 }],
    [{ sequence: 3, cause: 'missing' }],
    1_798_765_300_000,
    3_600_000,
  );

  expect(notices).toStrictEqual([{ sequence: 3, cause: 'failed' }]);
});

test('it raises nothing for a failed set that a newer published set covers', () => {
  const notices = pickBackupNotices(
    [
      { sequence: 3, state: 'failed', staged_at: 1_798_761_600_000 },
      { sequence: 4, state: 'published', staged_at: 1_798_765_200_000 },
    ],
    [],
    1_798_765_300_000,
    3_600_000,
  );

  expect(notices).toStrictEqual([]);
});

test('it raises a notice for each failed set since the last published one', () => {
  const notices = pickBackupNotices(
    [
      { sequence: 2, state: 'published', staged_at: 1_798_758_000_000 },
      { sequence: 3, state: 'failed', staged_at: 1_798_761_600_000 },
      { sequence: 4, state: 'failed', staged_at: 1_798_765_200_000 },
    ],
    [],
    1_798_765_300_000,
    3_600_000,
  );

  expect(notices).toStrictEqual([
    { sequence: 3, cause: 'failed' },
    { sequence: 4, cause: 'failed' },
  ]);
});
