import { expect, mock, onTestFinished, test } from 'bun:test';
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

  await sql`create table notes (id text primary key)`.execute(db);

  return { db, other, commits: new EventTarget() };
}

test('it commits a write under the current writer epoch', async () => {
  const ctx = await setupTest();
  const epoch = await claimWriterEpoch(ctx.db);

  await withWriteTransaction({ db: ctx.db, epoch, commits: ctx.commits }, async (tx) => {
    await sql`insert into notes (id) values ('n1')`.execute(tx);
  });

  const notes = await sql`select id from notes`.execute(ctx.db);

  expect(notes.rows).toStrictEqual([{ id: 'n1' }]);
});

test('it fires a commit event once the write has committed', async () => {
  const ctx = await setupTest();
  const epoch = await claimWriterEpoch(ctx.db);

  // a read that another connection starts on the event sees the write, so the event came after the
  // commit
  const reads: Promise<{ readonly rows: readonly unknown[] }>[] = [];

  ctx.commits.addEventListener('commit', () => {
    reads.push(sql`select id from notes`.execute(ctx.other));
  });

  await withWriteTransaction({ db: ctx.db, epoch, commits: ctx.commits }, async (tx) => {
    await sql`insert into notes (id) values ('n1')`.execute(tx);
  });

  const notes = await Promise.all(reads);

  expect(notes.map((read) => read.rows)).toStrictEqual([[{ id: 'n1' }]]);
});

test('it fails a write transaction under an older epoch and commits none of it', async () => {
  const ctx = await setupTest();
  const epoch = await claimWriterEpoch(ctx.db);

  await claimWriterEpoch(ctx.other);

  const write = withWriteTransaction({ db: ctx.db, epoch, commits: ctx.commits }, async (tx) => {
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

test('it fires no commit event for a write transaction that fails', async () => {
  const ctx = await setupTest();
  const epoch = await claimWriterEpoch(ctx.db);

  const onCommit = mock<() => void>();

  ctx.commits.addEventListener('commit', onCommit);

  const write = withWriteTransaction({ db: ctx.db, epoch, commits: ctx.commits }, () =>
    Promise.reject(new Error('the write failed')),
  );

  await write.catch(() => {});

  expect(onCommit).not.toHaveBeenCalled();
});
