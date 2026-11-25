import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startDatabase } from '@heynixie/db';
import { sql } from 'kysely';
import { claimWriterEpoch } from './claim-writer-epoch';
import { markChanged } from './mark-changed';
import { publishChanged } from './publish-changed';
import { subscribeToChanged } from './subscribe-to-changed';
import { subscribeToCommits } from './subscribe-to-commits';
import { withWriteTransaction } from './with-write-transaction';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-changed-'));

  stack.defer(() => rm(dataDir, { recursive: true, force: true }));

  const db = startDatabase(join(dataDir, 'nixie.db'));

  stack.defer(() => db.destroy());

  const epoch = await claimWriterEpoch(db);

  const writer = { db, epoch, commits: new EventTarget() };
  const changes: (readonly string[])[] = [];

  subscribeToChanged(writer, (topics) => {
    changes.push(topics);
  });

  return { writer, changes };
}

test('it sends the topics a transaction marked once it commits', async () => {
  const ctx = await setupTest();

  await withWriteTransaction(ctx.writer, async (tx) => {
    markChanged(tx, ['backups']);

    await sql`select 1`.execute(tx);
  });

  expect(ctx.changes).toStrictEqual([['backups']]);
});

test('it merges every topic of one transaction into one event with each topic once', async () => {
  const ctx = await setupTest();

  await withWriteTransaction(ctx.writer, async (tx) => {
    markChanged(tx, ['tasks', 'definitions']);
    markChanged(tx, ['tasks', 'triggers']);

    await sql`select 1`.execute(tx);
  });

  expect(ctx.changes).toStrictEqual([['tasks', 'definitions', 'triggers']]);
});

test('it sends nothing for a transaction that marked no topic', async () => {
  const ctx = await setupTest();

  await withWriteTransaction(ctx.writer, async (tx) => {
    await sql`select 1`.execute(tx);
  });

  expect(ctx.changes).toStrictEqual([]);
});

test('it drops the topics of a transaction that rolls back', async () => {
  const ctx = await setupTest();

  const write = await Promise.allSettled([
    withWriteTransaction(ctx.writer, async (tx) => {
      markChanged(tx, ['nixie']);

      await sql`select 1`.execute(tx);

      throw new Error('the write failed');
    }),
  ]);

  expect(write[0]?.status).toBe('rejected');
  expect(ctx.changes).toStrictEqual([]);
});

test('it does not carry the topics of one transaction into the next', async () => {
  const ctx = await setupTest();

  await withWriteTransaction(ctx.writer, async (tx) => {
    markChanged(tx, ['nixie']);

    await sql`select 1`.execute(tx);
  });

  await withWriteTransaction(ctx.writer, async (tx) => {
    markChanged(tx, ['spend']);

    await sql`select 1`.execute(tx);
  });

  expect(ctx.changes).toStrictEqual([['nixie'], ['spend']]);
});

test('it still wakes a commit subscriber once for a transaction that marked topics', async () => {
  const ctx = await setupTest();

  const commits: string[] = [];

  subscribeToCommits(ctx.writer, () => {
    commits.push('commit');
  });

  await withWriteTransaction(ctx.writer, async (tx) => {
    markChanged(tx, ['backups']);

    await sql`select 1`.execute(tx);
  });

  expect(commits).toStrictEqual(['commit']);
});

test('it sends the topics of a change that no write made', async () => {
  const ctx = await setupTest();

  publishChanged(ctx.writer, ['spend']);

  expect(ctx.changes).toStrictEqual([['spend']]);
});

test('it refuses to mark a transaction that withWriteTransaction did not open', async () => {
  const ctx = await setupTest();

  const mark = await Promise.allSettled([
    ctx.writer.db.transaction().execute(async (tx) => {
      markChanged(tx, ['nixie']);

      await sql`select 1`.execute(tx);
    }),
  ]);

  expect(mark[0]?.status).toBe('rejected');
});
