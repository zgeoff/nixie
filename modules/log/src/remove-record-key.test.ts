import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sql } from 'kysely';
import { readRecords } from './read-records';
import { removeRecordKey } from './remove-record-key';
import { startTestLog } from './test-utils/start-test-log';
import { writeRecords } from './write-records';

test('it leaves the envelope and a gap where the payload was once the key is gone', async () => {
  const ctx = await startTestLog();

  await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:aa11' },
      thread: 'conversation',
      contentSource: 'owner',
      payload: { spans: 1 },
      erasable: { text: 'forget that I said this' },
    },
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:aa11' },
      erasable: { text: 'keep this one' },
    },
  ]);

  const keys = await sql<{ key_id: string }>`select key_id from records
    where sequence = 1`.execute(ctx.writer.db);

  await removeRecordKey(ctx.log, keys.rows.at(0)?.key_id ?? '');

  const read = await readRecords(ctx.log, { afterSequence: 0 });

  expect(read.at(0)?.record).toStrictEqual({
    sequence: 1,
    recordedAt: expect.toBeValidDate(),
    kind: 'owner_message',
    definitions: { snapshotHash: 'sha256:aa11' },
    thread: 'conversation',
    stepKey: null,
    parent: null,
    contentSource: 'owner',
    decision: null,
    promptCause: null,
    approval: null,
    payload: { spans: 1 },
    erasable: { status: 'shredded' },
  });
  expect(read.at(1)?.record.erasable).toStrictEqual({
    status: 'readable',
    fields: { text: 'keep this one' },
  });
});

test('it leaves no copy of the wrapped key in keys.db or its WAL', async () => {
  const ctx = await startTestLog();

  await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:aa11' },
      erasable: { text: 'forget that I said this' },
    },
  ]);

  const stored = await sql<{ key_id: string; wrapped: Uint8Array }>`select key_id, wrapped
    from record_keys`.execute(ctx.writer.keys);
  const key = stored.rows.at(0) ?? { key_id: '', wrapped: new Uint8Array() };
  const walBefore = await readFile(join(ctx.dataDir, 'keys.db-wal'));

  await removeRecordKey(ctx.log, key.key_id);

  const files = await Promise.all(
    ['keys.db', 'keys.db-wal'].map((name) => readFile(join(ctx.dataDir, name))),
  );

  expect(walBefore.includes(key.wrapped)).toBeTrue();
  expect(files.map((file) => file.includes(key.wrapped))).toStrictEqual([false, false]);
});
