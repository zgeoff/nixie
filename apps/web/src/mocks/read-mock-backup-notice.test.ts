import { expect, test } from 'bun:test';
import { readMockBackupNotice } from './read-mock-backup-notice';
import { store } from './store';

test('it reads no notice when the store holds none', () => {
  expect(readMockBackupNotice()).toStrictEqual({ notice: null });
});

test('it reads the newest notice the store holds', async () => {
  await store.backupNotices.create({
    cause: 'missing',
    sequence: 6,
    raisedAt: new Date('2026-11-02T07:00:00Z'),
  });

  await store.backupNotices.create({
    cause: 'failed',
    sequence: 7,
    raisedAt: new Date('2026-11-02T08:00:00Z'),
  });

  expect(readMockBackupNotice()).toStrictEqual({
    notice: { cause: 'failed', sequence: 7, raisedAt: new Date('2026-11-02T08:00:00Z') },
  });
});
