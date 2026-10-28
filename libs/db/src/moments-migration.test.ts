import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { buildSqliteWorkerDialect } from './build-sqlite-worker-dialect';
import { momentsMigration } from './moments-migration';
import { nixieSchema } from './nixie-schema';
import { runMigrations } from './run-migrations';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-moments-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, { schema: nixieSchema, copyDir: directory });

  return { db };
}

test('it moves the schema to version 28, which the release before can still read', () => {
  expect(nixieSchema.migrations.indexOf(momentsMigration) + 1).toBe(28);
  expect(nixieSchema.oldestReader).toBeLessThan(28);
});

test('it refuses a moment in a state the store never writes', async () => {
  const ctx = await setupTest();

  await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
    values (1, 1767225600000, 'moment_kept', 'snapshot-a', '{}')`.execute(ctx.db);

  const refused = await sql`insert into moments (moment_id, short_id, thread, first_sequence,
    last_sequence, state, version, kept_by, kept_at, kept_sequence, title_sequence,
    updated_sequence)
    values ('8a1f3c52-0b6e-4d7a-9c21-5e4f6a7b8c9d', 'p4m8v2qx7k', 'conversation', 1, 1, 'lost', 1,
      'model', 1767225600000, 1, 1, 1)`
    .execute(ctx.db)
    .then(
      () => null,
      (error: unknown) => error,
    );

  expect(refused).toBeInstanceOf(Error);
});
