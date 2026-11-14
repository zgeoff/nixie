import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { runMigrations } from '../migration/run-migrations';
import { nixieSchema } from '../schema/nixie-schema';
import { buildSqliteWorkerDialect } from '../sqlite/build-sqlite-worker-dialect';
import { readRunPrefix } from '../test-utils/read-run-prefix';
import { proposalAnsweredByMigration } from './0049-proposal-answered-by-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-answered-by-migration-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, { schema: nixieSchema, copyDir: directory });

  return {
    db,
    writeRecord: async (kind: string, payload: unknown) => {
      await sql`insert into records (recorded_at, kind, snapshot_hash, payload)
        values (1000, ${kind}, 'snapshot', ${JSON.stringify(payload)})`.execute(db);
    },
    writeProposal: async (proposalID: string, state: string) => {
      await sql`insert into proposals (
          proposal_id, short_id, family, kind, risk_class, action_hash, cause,
          created_sequence, created_at, lapses_at, state
        ) values (
          ${proposalID}, ${proposalID}, 'skill', 'internal_change', 'routine', 'hash', 'skill_write',
          1, 1000, 2000, ${state}
        )`.execute(db);
    },
    runMigration: () => db.transaction().execute((tx) => proposalAnsweredByMigration.up(tx)),
  };
}

test('it is the migration of version 49', () => {
  expect(nixieSchema.migrations.indexOf(proposalAnsweredByMigration) + 1).toBe(49);
});

test('it fills the answering identity from the closing record of each answered row', async () => {
  const ctx = await setupTest();

  await ctx.writeProposal('skill-approved', 'approved');
  await ctx.writeProposal('skill-declined', 'declined');
  await ctx.writeProposal('skill-lapsed', 'lapsed');

  await ctx.writeRecord('skills.write_approved', {
    proposalID: 'skill-approved',
    identityID: 'i-1',
  });

  await ctx.writeRecord('skills.write_rejected', {
    proposalID: 'skill-declined',
    identityID: 'i-2',
  });

  await ctx.writeRecord('skills.write_lapsed', { proposalID: 'skill-lapsed' });
  await ctx.runMigration();

  const rows = await sql`select proposal_id, answered_by from proposals
    order by proposal_id`.execute(ctx.db);

  expect(rows.rows).toStrictEqual([
    { proposal_id: 'skill-approved', answered_by: 'i-1' },
    { proposal_id: 'skill-declined', answered_by: 'i-2' },
    { proposal_id: 'skill-lapsed', answered_by: null },
  ]);
});

test('it leaves a row that a record without an identity closed with no answering identity', async () => {
  const ctx = await setupTest();

  await ctx.writeProposal('skill-approved', 'approved');
  await ctx.writeRecord('skills.write_approved', { proposalID: 'skill-approved' });
  await ctx.runMigration();

  const rows = await sql`select answered_by from proposals`.execute(ctx.db);

  expect(rows.rows).toStrictEqual([{ answered_by: null }]);
});
