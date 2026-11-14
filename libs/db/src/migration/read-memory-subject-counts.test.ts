import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'kysely';
import { startDatabase } from '../database/start-database';
import { nixieSchema } from '../schema/nixie-schema';
import { buildAfterQueryPlugin } from '../test-utils/build-after-query-plugin';
import { buildSeeder } from '../test-utils/build-seeder';
import { readMemorySubjectCounts } from './read-memory-subject-counts';
import { runMigrations } from './run-migrations';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-count-subjects-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = startDatabase(join(directory, 'nixie.db'));

  stack.defer(() => db.destroy());

  return { db, directory, seed: buildSeeder(db) };
}

test('it counts the items of each subject', async () => {
  const ctx = await setupTest();

  await runMigrations(ctx.db, { schema: nixieSchema, copyDir: ctx.directory });

  await ctx.seed.record();
  await ctx.seed.memoryItem({ subject: 'owner' });
  await ctx.seed.memoryItem({ subject: 'shared' });
  await ctx.seed.memoryItem({ subject: 'shared' });

  const counts = await readMemorySubjectCounts(ctx.db);

  expect(counts).toStrictEqual({
    items: { owner: 1, shared: 2, self: 0 },
    proposals: { owner: 0, shared: 0, self: 0 },
  });
});

test('it counts the proposals of each subject', async () => {
  const ctx = await setupTest();

  await runMigrations(ctx.db, { schema: nixieSchema, copyDir: ctx.directory });

  await ctx.seed.record({ kind: 'memory.proposal_created' });
  await ctx.seed.memoryProposal({ subject: 'owner' });
  await ctx.seed.memoryProposal({ subject: 'shared' });
  await ctx.seed.memoryProposal({ subject: 'self', reviewReason: 'self_note' });

  const counts = await readMemorySubjectCounts(ctx.db);

  expect(counts).toStrictEqual({
    items: { owner: 0, shared: 0, self: 0 },
    proposals: { owner: 1, shared: 1, self: 1 },
  });
});

test('it counts a row the release before wrote with no subject by its kind', async () => {
  const ctx = await setupTest();

  await runMigrations(ctx.db, { schema: nixieSchema, copyDir: ctx.directory });

  await ctx.seed.record();
  await ctx.seed.memoryItem({ kind: 'fact', subject: null });
  await ctx.seed.memoryItem({ kind: 'self', subject: null });

  const counts = await readMemorySubjectCounts(ctx.db);

  expect(counts).toStrictEqual({
    items: { owner: 1, shared: 0, self: 1 },
    proposals: { owner: 0, shared: 0, self: 0 },
  });
});

test('it reads both counts from one snapshot while another connection commits between them', async () => {
  const ctx = await setupTest();

  await runMigrations(ctx.db, { schema: nixieSchema, copyDir: ctx.directory });

  await ctx.seed.record({ kind: 'memory.proposal_created' });

  const item = await ctx.seed.memoryItem({ subject: 'owner' });

  await ctx.seed.memoryProposal({ itemID: item.itemID, subject: 'owner' });

  const other = startDatabase(join(ctx.directory, 'nixie.db'), { busyTimeoutMs: 0 });

  onTestFinished(() => other.destroy());

  await sql`select 1`.execute(other);

  const counted = ctx.db.withPlugin(
    buildAfterQueryPlugin(2, async () => {
      await Promise.allSettled([
        other.transaction().execute(async (tx) => {
          const seed = buildSeeder(tx);

          await seed.memoryItem({ subject: 'shared' });
          await seed.memoryProposal({ subject: 'shared' });
        }),
      ]);
    }),
  );

  const counts = await readMemorySubjectCounts(counted);

  expect(counts).toStrictEqual({
    items: { owner: 1, shared: 0, self: 0 },
    proposals: { owner: 1, shared: 0, self: 0 },
  });
});

test('it counts nothing in a database from before memory', async () => {
  const ctx = await setupTest();
  const counts = await readMemorySubjectCounts(ctx.db);

  expect(counts).toStrictEqual({
    items: { owner: 0, shared: 0, self: 0 },
    proposals: { owner: 0, shared: 0, self: 0 },
  });
});
