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
import { memoryChangeNoticesMigration } from './0068-memory-change-notices-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-change-notices-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, {
    schema: {
      migrations: nixieSchema.migrations.slice(
        0,
        nixieSchema.migrations.indexOf(memoryChangeNoticesMigration) + 1,
      ),
      oldestReader: 0,
    },
    copyDir: directory,
  });

  return { db };
}

test('it is the migration of version 68', () => {
  expect(nixieSchema.migrations.indexOf(memoryChangeNoticesMigration) + 1).toBe(68);
});

test('it admits a label edit, a pin and an unpin, and refuses any other change', async () => {
  const ctx = await setupTest();

  await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
    values (1, 1767225600000, 'memory.labelled', 'snapshot-a', '{}')`.execute(ctx.db);

  for (const [index, change] of ['labelled', 'pinned', 'unpinned'].entries()) {
    await sql`insert into memory_change_notices (entry_key, notice_key, thread, item_id, change,
      sequence, recorded_at)
      values (${`entry-${String(index)}`}, 'turn/m4', 'conversation', 'q7d2kx9m4a', ${change}, 1,
        1767225600000)`.execute(ctx.db);
  }

  const refused = sql`insert into memory_change_notices (entry_key, notice_key, thread, item_id,
    change, sequence, recorded_at)
    values ('entry-edited', 'turn/m4', 'conversation', 'q7d2kx9m4a', 'edited', 1, 1767225600000)`.execute(
    ctx.db,
  );

  await Promise.allSettled([refused]);

  expect(refused).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT_CHECK' });

  const changes = await sql`select change from memory_change_notices order by entry_key`.execute(
    ctx.db,
  );

  expect(changes.rows).toStrictEqual([
    { change: 'labelled' },
    { change: 'pinned' },
    { change: 'unpinned' },
  ]);
});

test('it leaves the change check of memory_notice_entries as the release before reads it', async () => {
  const ctx = await setupTest();

  const result = await sql`select sql from sqlite_master
    where type = 'table' and name = 'memory_notice_entries'`.execute(ctx.db);

  const [table] = z.array(z.object({ sql: z.string() })).parse(result.rows);

  expect(table?.sql).not.toInclude("'labelled'");
});
