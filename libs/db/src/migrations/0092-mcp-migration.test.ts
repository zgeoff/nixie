import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { runMigrations } from '../migration/run-migrations';
import { nixieSchema } from '../schema/nixie-schema';
import { buildSqliteWorkerDialect } from '../sqlite/build-sqlite-worker-dialect';
import { readRunPrefix } from '../test-utils/read-run-prefix';
import { mcpMigration } from './0092-mcp-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-mcp-migration-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, { schema: nixieSchema, copyDir: directory });

  return { db };
}

test('it moves the schema to version 92', () => {
  expect(nixieSchema.migrations.indexOf(mcpMigration) + 1).toBe(92);
});

test('it creates the tables of the servers, their tools and the tool forms', async () => {
  const ctx = await setupTest();

  const servers = await sql`select name from pragma_table_info('mcp_servers') order by cid`.execute(
    ctx.db,
  );

  const tools = await sql`select name from pragma_table_info('mcp_tools') order by cid`.execute(
    ctx.db,
  );

  const forms =
    await sql`select name from pragma_table_info('mcp_tool_forms') order by cid`.execute(ctx.db);

  expect([servers.rows, tools.rows, forms.rows]).toStrictEqual([
    [
      { name: 'server_id' },
      { name: 'state' },
      { name: 'url' },
      { name: 'client_id' },
      { name: 'scope' },
      { name: 'trusted' },
      { name: 'private_range' },
      { name: 'requested' },
      { name: 'proposal_id' },
      { name: 'client_credential_id' },
      { name: 'grant_credential_id' },
      { name: 'grant_binding' },
      { name: 'updated_sequence' },
    ],
    [
      { name: 'tool' },
      { name: 'server_id' },
      { name: 'pinned_hash' },
      { name: 'latest_hash' },
      { name: 'state' },
      { name: 'hidden_reason' },
      { name: 'proposal_id' },
      { name: 'updated_sequence' },
    ],
    [{ name: 'hash' }, { name: 'listed_seq' }],
  ]);
});

test('it keeps each server when it runs again', async () => {
  const ctx = await setupTest();

  await sql`insert into mcp_servers (server_id, state, updated_sequence)
    values ('tracker', 'held', 1)`.execute(ctx.db);

  await ctx.db.transaction().execute((tx) => mcpMigration.up(tx));

  const servers = await sql`select server_id from mcp_servers`.execute(ctx.db);

  expect(servers.rows).toStrictEqual([{ server_id: 'tracker' }]);
});
