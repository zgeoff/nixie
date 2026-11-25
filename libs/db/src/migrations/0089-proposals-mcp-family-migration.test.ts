import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { runMigrations } from '../migration/run-migrations';
import { nixieSchema } from '../schema/nixie-schema';
import { buildSqliteWorkerDialect } from '../sqlite/build-sqlite-worker-dialect';
import { readRunPrefix } from '../test-utils/read-run-prefix';
import { proposalsMcpFamilyMigration } from './0089-proposals-mcp-family-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-proposals-mcp-migration-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, { schema: nixieSchema, copyDir: directory });

  return { db };
}

test('it moves the schema to version 89', () => {
  expect(nixieSchema.migrations.indexOf(proposalsMcpFamilyMigration) + 1).toBe(89);
});

test('it lets a proposal take the mcp family', async () => {
  const ctx = await setupTest();

  await sql`insert into proposals (
      proposal_id, short_id, family, kind, risk_class, action_hash, cause, created_sequence,
      created_at, lapses_at, state
    ) values ('p1', 's1', 'mcp', 'internal_change', 'always_ask', 'h', 'mcp_config', 1, 1, 2, 'pending')`.execute(
    ctx.db,
  );

  const rows = await sql`select family from proposals`.execute(ctx.db);

  expect(rows.rows).toStrictEqual([{ family: 'mcp' }]);
});

test('it keeps the proposals and the three indexes of the table when it runs again', async () => {
  const ctx = await setupTest();

  await sql`insert into proposals (
      proposal_id, short_id, family, kind, risk_class, action_hash, cause, created_sequence,
      created_at, lapses_at, state, answered_by
    ) values ('p1', 's1', 'skill', 'internal_change', 'routine', 'h', 'skill_write', 1, 1, 2, 'approved', 'owner')`.execute(
    ctx.db,
  );

  await ctx.db.transaction().execute((tx) => proposalsMcpFamilyMigration.up(tx));

  const rows = await sql`select proposal_id, answered_by from proposals`.execute(ctx.db);

  const indexes = await sql`select name from pragma_index_list('proposals')
    where name like 'proposals_by_%' order by name`.execute(ctx.db);

  expect([rows.rows, indexes.rows]).toStrictEqual([
    [{ proposal_id: 'p1', answered_by: 'owner' }],
    [
      { name: 'proposals_by_short_id' },
      { name: 'proposals_by_state_and_lapse' },
      { name: 'proposals_by_state_and_return' },
    ],
  ]);
});
