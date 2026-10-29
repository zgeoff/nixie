import { expect, test } from 'bun:test';
import { backupReceiptSchema } from './backup-receipt';

test('it accepts a published receipt with both snapshots and a passed prune and check', () => {
  const payload = {
    format: 1,
    sequence: 7,
    writtenAt: 1_798_761_660_000,
    status: 'published',
    dataSnapshotID: 'a'.repeat(64),
    keySnapshotID: 'b'.repeat(64),
    removedKeySnapshotIDs: ['c'.repeat(64)],
    prune: 'passed',
    check: 'passed',
    failure: null,
  } as const;

  expect(backupReceiptSchema.safeParse(payload).data).toStrictEqual(payload);
});

test('it accepts a failed receipt that names its failure', () => {
  const payload = {
    format: 1,
    sequence: 7,
    writtenAt: 1_798_761_660_000,
    status: 'failed',
    dataSnapshotID: 'a'.repeat(64),
    keySnapshotID: 'b'.repeat(64),
    removedKeySnapshotIDs: ['c'.repeat(64)],
    prune: 'failed',
    check: 'not-run',
    failure: 'restic prune exited 1',
  } as const;

  expect(backupReceiptSchema.safeParse(payload).data).toStrictEqual(payload);
});

test('it refuses a published receipt whose prune failed', () => {
  const result = backupReceiptSchema.safeParse({
    format: 1,
    sequence: 7,
    writtenAt: 1_798_761_660_000,
    status: 'published',
    dataSnapshotID: 'a'.repeat(64),
    keySnapshotID: 'b'.repeat(64),
    removedKeySnapshotIDs: ['c'.repeat(64)],
    prune: 'failed',
    check: 'passed',
    failure: null,
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['status'] });
});

test('it refuses a published receipt with no key snapshot', () => {
  const result = backupReceiptSchema.safeParse({
    format: 1,
    sequence: 7,
    writtenAt: 1_798_761_660_000,
    status: 'published',
    dataSnapshotID: 'a'.repeat(64),
    keySnapshotID: null,
    removedKeySnapshotIDs: ['c'.repeat(64)],
    prune: 'passed',
    check: 'passed',
    failure: null,
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['status'] });
});

test('it refuses a failed receipt that names no failure', () => {
  const result = backupReceiptSchema.safeParse({
    format: 1,
    sequence: 7,
    writtenAt: 1_798_761_660_000,
    status: 'failed',
    dataSnapshotID: null,
    keySnapshotID: null,
    removedKeySnapshotIDs: [],
    prune: 'not-run',
    check: 'not-run',
    failure: null,
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['status'] });
});
