import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { z } from 'zod';
import { runMigrations } from '../migration/run-migrations';
import { nixieSchema } from '../schema/nixie-schema';
import { buildSqliteWorkerDialect } from '../sqlite/build-sqlite-worker-dialect';
import { readRunPrefix } from '../test-utils/read-run-prefix';
import { triggerHoldsMigration } from './0075-trigger-holds-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-trigger-holds-migration-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, { schema: nixieSchema, copyDir: directory });

  return { db };
}

test('it moves the schema to version 75', () => {
  expect(nixieSchema.migrations.indexOf(triggerHoldsMigration) + 1).toBe(75);
});

test('it adds a hold that is null for a definition armed without one', async () => {
  const ctx = await setupTest();

  await sql`insert into trigger_definitions
    (definition_id, source_id, definition_hash, target, trigger, after, updated_sequence)
    values ('reminder:a', 'schedule', 'h', 'conversation', '{}', 5, 1)`.execute(ctx.db);

  const rows = await sql`select hold_slot, hold_until from trigger_definitions`.execute(ctx.db);

  const holdsSchema = z.array(z.object({ hold_slot: z.null(), hold_until: z.null() }));
  const holds = holdsSchema.parse(rows.rows);

  expect(holds).toStrictEqual([{ hold_slot: null, hold_until: null }]);
});
