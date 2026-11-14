import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { z } from 'zod';
import { buildSqliteWorkerDialect } from '../build-sqlite-worker-dialect';
import { nixieSchema } from '../nixie-schema';
import { runMigrations } from '../run-migrations';
import { readRunPrefix } from '../test-utils/read-run-prefix';
import { proposalsMigration } from './0043-proposals-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-proposals-migration-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, { schema: nixieSchema, copyDir: directory });

  return {
    db,
    writeRecord: async (kind: string, recordedAt: number, payload: unknown) => {
      await sql`insert into records (recorded_at, kind, snapshot_hash, payload)
        values (${recordedAt}, ${kind}, 'snapshot', ${JSON.stringify(payload)})`.execute(db);
    },
  };
}

test('it is the migration of version 43', () => {
  expect(nixieSchema.migrations.indexOf(proposalsMigration) + 1).toBe(43);
});

test('it folds the proposal records that exist before it into rows', async () => {
  const ctx = await setupTest();

  const hour = 60 * 60 * 1000;

  await ctx.writeRecord('skills.write_proposed', 1000, {
    proposalID: 'skill-1',
    skillHash: 'hash-a',
  });

  await ctx.writeRecord('skills.write_proposed', 2000, {
    proposalID: 'skill-2',
    skillHash: 'hash-b',
  });

  await ctx.writeRecord('skills.write_approved', 3000, { proposalID: 'skill-1' });
  await sql`delete from proposals`.execute(ctx.db);
  await ctx.db.transaction().execute((tx) => proposalsMigration.up(tx));

  const rows = await sql`select proposal_id, state, action_hash, lapses_at from proposals
    order by proposal_id`.execute(ctx.db);

  const parsed = z
    .array(
      z.object({
        proposal_id: z.string(),
        state: z.string(),
        action_hash: z.string(),
        lapses_at: z.number(),
      }),
    )
    .parse(rows.rows);

  expect(parsed).toStrictEqual([
    {
      proposal_id: 'skill-1',
      state: 'approved',
      action_hash: 'hash-a',
      lapses_at: 1000 + 14 * 24 * hour,
    },
    {
      proposal_id: 'skill-2',
      state: 'pending',
      action_hash: 'hash-b',
      lapses_at: 2000 + 14 * 24 * hour,
    },
  ]);
});

test('it leaves the rows of a table that already holds some', async () => {
  const ctx = await setupTest();

  await ctx.writeRecord('skills.write_proposed', 1000, {
    proposalID: 'skill-1',
    skillHash: 'hash-a',
  });

  await sql`delete from proposals`.execute(ctx.db);
  await ctx.db.transaction().execute((tx) => proposalsMigration.up(tx));
  await ctx.db.transaction().execute((tx) => proposalsMigration.up(tx));

  const rows = await sql`select count(*) as total from proposals`.execute(ctx.db);

  const totals = z.array(z.object({ total: z.number() })).parse(rows.rows);

  expect(totals).toStrictEqual([{ total: 1 }]);
});
