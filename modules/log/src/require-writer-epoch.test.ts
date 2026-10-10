import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startDatabase } from '@heynixie/db';
import { sql } from 'kysely';
import { claimWriterEpoch } from './claim-writer-epoch';
import { requireWriterEpoch } from './require-writer-epoch';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-require-epoch-'));

  stack.defer(() => rm(dataDir, { recursive: true, force: true }));

  const db = startDatabase(join(dataDir, 'nixie.db'));

  stack.defer(() => db.destroy());

  return { db };
}

test('it accepts the epoch the database holds', async () => {
  const ctx = await setupTest();

  const epoch = await claimWriterEpoch(ctx.db);

  const passed = await ctx.db.transaction().execute(async (tx) => {
    await requireWriterEpoch(tx, epoch);
    return true;
  });

  expect(passed).toBeTrue();
});

test('it refuses an epoch older than the one the database holds', async () => {
  const ctx = await setupTest();

  const epoch = await claimWriterEpoch(ctx.db);

  await claimWriterEpoch(ctx.db);

  const check = ctx.db.transaction().execute((tx) => requireWriterEpoch(tx, epoch));

  await check.catch(() => {});

  expect(check).rejects.toThrowWithMessage(
    Error,
    'writer epoch 1 is stale: the database holds writer epoch 2',
  );
});

test('it refuses any epoch when the database holds no writer epoch row', async () => {
  const ctx = await setupTest();

  await sql`create table writer_epoch (id integer primary key, epoch integer not null)`.execute(
    ctx.db,
  );

  const check = ctx.db.transaction().execute((tx) => requireWriterEpoch(tx, 1));

  await check.catch(() => {});

  expect(check).rejects.toThrowWithMessage(
    Error,
    'writer epoch 1 is stale: the database holds writer epoch none',
  );
});
