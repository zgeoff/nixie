import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { buildSqliteWorkerDialect } from './build-sqlite-worker-dialect';
import { memoryConsolidationSummaryMigration } from './memory-consolidation-summary-migration';
import { nixieSchema } from './nixie-schema';
import { runMigrations } from './run-migrations';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dir = await mkdtemp(join(tmpdir(), 'nixie-consolidation-summary-'));

  stack.defer(() => rm(dir, { recursive: true, force: true }));

  const db = new Kysely<unknown>({ dialect: buildSqliteWorkerDialect(join(dir, 'nixie.db')) });

  stack.defer(() => db.destroy());

  // the schema the release before leaves, which the migration starts from
  await runMigrations(db, {
    schema: {
      migrations: nixieSchema.migrations.slice(
        0,
        nixieSchema.migrations.indexOf(memoryConsolidationSummaryMigration),
      ),
      oldestReader: 0,
    },
    copyDir: dir,
  });

  // a run that a release before folded, which names no summary columns
  await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
    values (1, 1767225600000, 'memory.consolidation_proposed', 'snapshot-a', '{}')`.execute(db);
  await sql`insert into memory_consolidations (diff_id, model, changes, shown_items, sequence,
    created_at) values ('diff-1', 'claude-test-1', 0, 2, 1, 1767225600000)`.execute(db);

  return { db };
}

test('it moves the schema to version 14', () => {
  expect(nixieSchema.migrations.indexOf(memoryConsolidationSummaryMigration) + 1).toBe(14);
});

test('it leaves an existing run with no summary, and a run a release before folds after it too', async () => {
  const ctx = await setupTest();

  await ctx.db.transaction().execute((tx) => memoryConsolidationSummaryMigration.up(tx));
  await sql`insert into memory_consolidations (diff_id, model, changes, shown_items, sequence,
    created_at) values ('diff-2', 'claude-test-1', 0, 2, 1, 1767225600000)`.execute(ctx.db);

  const rows = await sql`select diff_id, summary, summary_shares, summary_lapse_at
    from memory_consolidations order by diff_id`.execute(ctx.db);

  expect(rows.rows).toStrictEqual([
    { diff_id: 'diff-1', summary: null, summary_shares: null, summary_lapse_at: null },
    { diff_id: 'diff-2', summary: null, summary_shares: null, summary_lapse_at: null },
  ]);
});

test('it keeps a summary as it is when it runs again', async () => {
  const ctx = await setupTest();

  await ctx.db.transaction().execute((tx) => memoryConsolidationSummaryMigration.up(tx));
  await sql`update memory_consolidations set summary = 'c2VhbGVk', summary_shares = '[]',
    summary_lapse_at = 1767830400000`.execute(ctx.db);

  await ctx.db.transaction().execute((tx) => memoryConsolidationSummaryMigration.up(tx));

  const rows = await sql`select summary, summary_shares, summary_lapse_at
    from memory_consolidations`.execute(ctx.db);

  expect(rows.rows).toStrictEqual([
    { summary: 'c2VhbGVk', summary_shares: '[]', summary_lapse_at: 1_767_830_400_000 },
  ]);
});
