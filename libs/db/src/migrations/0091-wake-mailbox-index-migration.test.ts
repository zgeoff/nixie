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
import { wakeMailboxIndexMigration } from './0091-wake-mailbox-index-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-wake-mailbox-index-migration-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, { schema: nixieSchema, copyDir: directory });

  return { db };
}

test('it moves the schema to version 91', () => {
  expect(nixieSchema.migrations.indexOf(wakeMailboxIndexMigration) + 1).toBe(91);
});

test('it answers a lookup of the wakes of one mailbox from the index', async () => {
  const ctx = await setupTest();

  const plan = await sql`explain query plan
    select key_id
    from records
    where kind = 'trigger.mail_woke'
      and json_extract(payload, '$.mailbox') = 'gmail:c1'`.execute(ctx.db);

  const details = z.array(z.object({ detail: z.string() })).parse(plan.rows);

  expect(details.map((row) => row.detail)).toContainEqual(
    expect.stringContaining('records_by_mail_woke_mailbox'),
  );
});
