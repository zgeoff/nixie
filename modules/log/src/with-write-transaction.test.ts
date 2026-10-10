import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startDatabase } from '@heynixie/db';
import { sql } from 'kysely';
import { claimWriterEpoch } from './claim-writer-epoch';
import { withWriteTransaction } from './with-write-transaction';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-write-'));

  stack.defer(() => rm(dataDir, { recursive: true, force: true }));

  const db = startDatabase(join(dataDir, 'nixie.db'));

  stack.defer(() => db.destroy());

  // a second connection on the same file stands in for a second process
  const other = startDatabase(join(dataDir, 'nixie.db'));

  stack.defer(() => other.destroy());

  return { db, other };
}

test('it commits a write under the current writer epoch', async () => {
  const ctx = await setupTest();

  const epoch = await claimWriterEpoch(ctx.db);

  await sql`create table notes (id text primary key)`.execute(ctx.db);

  await withWriteTransaction({ db: ctx.db, epoch }, async (tx) => {
    await sql`insert into notes (id) values ('n1')`.execute(tx);
  });

  const notes = await sql`select id from notes`.execute(ctx.db);

  expect(notes.rows).toStrictEqual([{ id: 'n1' }]);
});

test('it fails a write transaction under an older epoch and commits none of it', async () => {
  const ctx = await setupTest();

  const epoch = await claimWriterEpoch(ctx.db);

  await claimWriterEpoch(ctx.other);
  await sql`create table notes (id text primary key)`.execute(ctx.db);

  const write = withWriteTransaction({ db: ctx.db, epoch }, async (tx) => {
    await sql`insert into notes (id) values ('stale')`.execute(tx);
  });

  await write.catch(() => {});

  const notes = await sql`select id from notes`.execute(ctx.db);

  expect(write).rejects.toThrowWithMessage(
    Error,
    'writer epoch 1 is stale: the database holds writer epoch 2',
  );
  expect(notes.rows).toStrictEqual([]);
});
