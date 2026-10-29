import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { formatBackupFile } from './format-backup-file';

// The writer's output for format 1 matches the committed file, so a change to what a set holds
// fails here until it becomes a new format beside the old one.
test('it writes a manifest as the format 1 file holds it', async () => {
  const committed: unknown = await Bun.file(
    join(import.meta.dir, '..', 'backup-formats', '1', 'manifest.json'),
  ).json();

  const text = formatBackupFile({
    format: 1,
    kind: 'forget',
    sequence: 42,
    stagedAt: 1_798_761_600_000,
    copies: [
      {
        name: 'nixie.db',
        bytes: 81_920,
        sha256: '3f4a3f4a3f4a3f4a3f4a3f4a3f4a3f4a3f4a3f4a3f4a3f4a3f4a3f4a3f4a3f4a',
      },
      {
        name: 'keys.db',
        bytes: 12_288,
        sha256: 'a1b2a1b2a1b2a1b2a1b2a1b2a1b2a1b2a1b2a1b2a1b2a1b2a1b2a1b2a1b2a1b2',
      },
    ],
  });

  expect(JSON.parse(text)).toStrictEqual(committed);
});

test('it writes a receipt as the format 1 file holds it', async () => {
  const committed: unknown = await Bun.file(
    join(import.meta.dir, '..', 'backup-formats', '1', 'receipt-published.json'),
  ).json();

  const text = formatBackupFile({
    format: 1,
    sequence: 42,
    writtenAt: 1_798_761_660_000,
    status: 'published',
    dataSnapshotID: '5e8f5e8f5e8f5e8f5e8f5e8f5e8f5e8f5e8f5e8f5e8f5e8f5e8f5e8f5e8f5e8f',
    keySnapshotID: '9d1c9d1c9d1c9d1c9d1c9d1c9d1c9d1c9d1c9d1c9d1c9d1c9d1c9d1c9d1c9d1c',
    removedKeySnapshotIDs: ['c4d5c4d5c4d5c4d5c4d5c4d5c4d5c4d5c4d5c4d5c4d5c4d5c4d5c4d5c4d5c4d5'],
    prune: 'passed',
    check: 'passed',
    failure: null,
  });

  expect(JSON.parse(text)).toStrictEqual(committed);
});

test('it ends the file with a newline', () => {
  const text = formatBackupFile({
    format: 1,
    sequence: 1,
    writtenAt: 0,
    status: 'failed',
    dataSnapshotID: null,
    keySnapshotID: null,
    removedKeySnapshotIDs: [],
    prune: 'not-run',
    check: 'not-run',
    failure: 'restic backup exited 1',
  });

  expect(text).toEndWith('}\n');
});
