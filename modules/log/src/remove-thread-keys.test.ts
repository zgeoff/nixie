import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import invariant from 'tiny-invariant';
import { readRecords } from './read-records';
import { removeThreadKeys } from './remove-thread-keys';
import { startTestLog } from './test-utils/start-test-log';
import type { LogTables } from './types';
import { writeRecords } from './write-records';

function setupTest() {
  return startTestLog();
}

test('it shreds every record on the thread and leaves the records of other threads readable', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:aa11' },
      thread: 'conversation',
      erasable: { text: 'the spare key is under the mat' },
    },
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:aa11' },
      thread: 'side-task',
      erasable: { text: 'water the ferns' },
    },
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:aa11' },
      thread: 'conversation',
      erasable: { text: 'the boat leaves at nine' },
    },
  ]);

  const removed = await removeThreadKeys(ctx.log, 'conversation');
  const read = await readRecords(ctx.log, { afterSequence: 0 });

  expect(removed).toBe(2);

  expect(read.map((entry) => [entry.record.thread, entry.record.erasable])).toStrictEqual([
    ['conversation', { status: 'shredded' }],
    ['side-task', { status: 'readable', fields: { text: 'water the ferns' } }],
    ['conversation', { status: 'shredded' }],
  ]);
});

test('it removes nothing and answers 0 when the thread holds no sealed record', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:aa11' },
      thread: 'conversation',
      payload: { spans: 1 },
    },
  ]);

  const removed = await removeThreadKeys(ctx.log, 'conversation');

  expect(removed).toBe(0);
});

test('it leaves no removed key in the key store file or its write-ahead log', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:aa11' },
      thread: 'conversation',
      erasable: { text: 'the gate code is 3391' },
    },
  ]);

  const row = await ctx.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('key_id')
    .where('sequence', '=', 1)
    .executeTakeFirstOrThrow();

  invariant(row.key_id);

  const keyID = row.key_id;

  await removeThreadKeys(ctx.log, 'conversation');

  const files = await Promise.all(
    ['keys.db', 'keys.db-wal'].map((name) =>
      readFile(join(ctx.dataDir, name)).then(
        (bytes) => bytes.toString('latin1'),
        () => '',
      ),
    ),
  );

  expect(files.filter((text) => text.includes(keyID))).toStrictEqual([]);
});
