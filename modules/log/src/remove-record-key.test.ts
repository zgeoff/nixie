import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readQueryRows } from '@heynixie/db';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { readRecords } from './read-records';
import { removeRecordKey } from './remove-record-key';
import { startTestLog } from './test-utils/start-test-log';
import { writeRecords } from './write-records';

function setupTest() {
  return startTestLog();
}

test('it leaves the envelope and a gap where the payload was once the key is gone', async () => {
  const ctx = await setupTest();

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

  const [key] = await readQueryRows(
    sql`select key_id from records where sequence = 1`,
    ctx.writer.db,
    z.object({ key_id: z.string() }),
  );

  invariant(key);

  await removeRecordKey(ctx.log, key.key_id);

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
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:aa11' },
      erasable: { text: 'forget that I said this' },
    },
  ]);

  const [key] = await readQueryRows(
    sql`select key_id, wrapped from record_keys`,
    ctx.writer.keys,
    z.object({ key_id: z.string(), wrapped: z.instanceof(Uint8Array) }),
  );

  invariant(key);

  const walBefore = await readFile(join(ctx.dataDir, 'keys.db-wal'));

  await removeRecordKey(ctx.log, key.key_id);

  const files = await Promise.all(
    ['keys.db', 'keys.db-wal'].map((name) => readFile(join(ctx.dataDir, name))),
  );

  expect(walBefore.includes(key.wrapped)).toBeTrue();
  expect(files.map((file) => file.includes(key.wrapped))).toStrictEqual([false, false]);
});

test('it refuses to remove a key under a stale writer epoch and keeps the key', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:aa11' },
      erasable: { text: 'keep me' },
    },
  ]);

  await sql`update writer_epoch set epoch = epoch + 1`.execute(ctx.writer.db);

  const stored = await readQueryRows(
    sql`select key_id from record_keys`,
    ctx.writer.keys,
    z.object({ key_id: z.string() }),
  );

  invariant(stored[0]);

  const remove = removeRecordKey(ctx.log, stored[0].key_id);

  await remove.catch(() => {});

  const left = await sql`select key_id from record_keys`.execute(ctx.writer.keys);

  expect(remove).rejects.toMatchObject({ name: 'StaleWriterError' });
  expect(left.rows).toStrictEqual(stored);
});
