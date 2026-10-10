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

  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-epoch-'));

  stack.defer(() => rm(dataDir, { recursive: true, force: true }));

  const db = startDatabase(join(dataDir, 'nixie.db'));

  stack.defer(() => db.destroy());

  // a second connection on the same file stands in for a second process
  const other = startDatabase(join(dataDir, 'nixie.db'));

  stack.defer(() => other.destroy());

  return { db, other };
}

test('it raises the writer epoch by one on each claim, starting at 1', async () => {
  const ctx = await setupTest();

  const first = await claimWriterEpoch(ctx.db);
  const second = await claimWriterEpoch(ctx.other);

  expect(first).toBe(1);
  expect(second).toBe(2);
});

test('it gives every concurrent claim its own epoch', async () => {
  const ctx = await setupTest();

  const epochs = await Promise.all(
    [ctx.db, ctx.other].flatMap((db) => Array.from({ length: 10 }, () => claimWriterEpoch(db))),
  );

  expect(epochs.toSorted((left, right) => left - right)).toStrictEqual(
    Array.from({ length: 20 }, (_, index) => index + 1),
  );
});

test('it commits the raise in one transaction that waits for a write already in flight', async () => {
  const ctx = await setupTest();

  const epoch = await claimWriterEpoch(ctx.db);

  await sql`create table notes (id text primary key)`.execute(ctx.db);

  const raise: { pending: Promise<number> | null } = { pending: null };
  const settledDuringWrite = await withWriteTransaction({ db: ctx.db, epoch }, async (tx) => {
    raise.pending = claimWriterEpoch(ctx.other);
    await sql`insert into notes (id) values ('before the raise')`.execute(tx);

    return Promise.race([raise.pending, Promise.resolve('pending')]);
  });
  const raised = await raise.pending;
  const notes = await sql`select id from notes`.execute(ctx.other);

  expect(settledDuringWrite).toBe('pending');
  expect(raised).toBe(2);
  expect(notes.rows).toStrictEqual([{ id: 'before the raise' }]);
});
