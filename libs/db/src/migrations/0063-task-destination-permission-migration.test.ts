import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { z } from 'zod';
import { runMigrations } from '../migration/run-migrations';
import { readQueryRows } from '../read-query-rows';
import { nixieSchema } from '../schema/nixie-schema';
import { buildSqliteWorkerDialect } from '../sqlite/build-sqlite-worker-dialect';
import { readRunPrefix } from '../test-utils/read-run-prefix';
import { taskDestinationPermissionMigration } from './0063-task-destination-permission-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-task-destination-permission-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, { schema: nixieSchema, copyDir: directory });

  return {
    writeRecord: async (kind: string, decision: string) => {
      await sql`insert into records (recorded_at, kind, decision, snapshot_hash, payload)
        values (1, ${kind}, ${decision}, 'snapshot', '{}')`.execute(db);
    },
    runMigration: () => db.transaction().execute((tx) => taskDestinationPermissionMigration.up(tx)),
    readDecisions: async () => {
      const rows = await readQueryRows(
        sql`select decision from records order by sequence`,
        db,
        z.object({ decision: z.string() }),
      );

      return rows.map((row) => row.decision);
    },
  };
}

test('it moves the schema to version 63, which the release before cannot read', () => {
  expect(nixieSchema.migrations.indexOf(taskDestinationPermissionMigration) + 1).toBe(63);
  expect(nixieSchema.oldestReader).toBeGreaterThanOrEqual(63);
});

test.each([
  {
    title: 'a tool_called decision',
    kind: 'tool_called',
    old: '{"outcome":"allow","stage":5,"permissions":["owner","job",null,"rule"],"ruleID":"r"}',
    next: '{"outcome":"allow","stage":5,"permissions":["owner","task",null,"rule"],"ruleID":"r"}',
  },
  {
    title: 'an action.queued decision',
    kind: 'action.queued',
    old: '{"outcome":"allow","permissions":["job"]}',
    next: '{"outcome":"allow","permissions":["task"]}',
  },
  {
    title: 'a decision of the first release',
    kind: 'tool_called',
    old: '{"outcome":"allow","destinations":[{"destination":"a@example.org","permission":"job"},{"destination":"b@example.org","permission":null}]}',
    next: '{"outcome":"allow","destinations":[{"destination":"a@example.org","permission":"task"},{"destination":"b@example.org","permission":null}]}',
  },
])('it rewrites the permission job in $title', async (row) => {
  const ctx = await setupTest();

  await ctx.writeRecord(row.kind, row.old);
  await ctx.runMigration();

  const decisions = await ctx.readDecisions();

  expect(decisions).toStrictEqual([row.next]);
});

test('it leaves a decision that names job only as a rule ID byte for byte', async () => {
  const ctx = await setupTest();

  const decision =
    '{"outcome":"allow",  "ruleID":"job","definitionID":"job","permissions":["owner"]}';

  await ctx.writeRecord('tool_called', decision);
  await ctx.runMigration();

  const decisions = await ctx.readDecisions();

  expect(decisions).toStrictEqual([decision]);
});

test('it changes nothing when it runs a second time', async () => {
  const ctx = await setupTest();

  await ctx.writeRecord('tool_called', '{"outcome":"allow","permissions":["job"]}');
  await ctx.runMigration();
  await ctx.runMigration();

  const decisions = await ctx.readDecisions();

  expect(decisions).toStrictEqual(['{"outcome":"allow","permissions":["task"]}']);
});
