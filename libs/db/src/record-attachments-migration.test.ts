import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { buildSqliteWorkerDialect } from './build-sqlite-worker-dialect';
import { nixieSchema } from './nixie-schema';
import { recordAttachmentsMigration } from './record-attachments-migration';
import { runMigrations } from './run-migrations';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-record-attachments-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  // the schema the release before leaves, which the migration starts from
  await runMigrations(db, {
    schema: {
      migrations: nixieSchema.migrations.slice(
        0,
        nixieSchema.migrations.indexOf(recordAttachmentsMigration),
      ),
      oldestReader: 0,
    },
    copyDir: directory,
  });

  // a sealed record, which an attachment belongs to
  await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload, key_id,
    sealed) values (1, 1767225600000, 'owner_message', 'snapshot-a', '{}', 'key-a',
    x'00')`.execute(db);

  return { db };
}

test('it moves the schema to version 15', () => {
  expect(nixieSchema.migrations.indexOf(recordAttachmentsMigration) + 1).toBe(15);
});

test('it keeps an attachment as it is when it runs again', async () => {
  const ctx = await setupTest();

  await ctx.db.transaction().execute((tx) => recordAttachmentsMigration.up(tx));

  await sql`insert into record_attachments (sequence, position, sealed)
    values (1, 0, x'0102')`.execute(ctx.db);

  await ctx.db.transaction().execute((tx) => recordAttachmentsMigration.up(tx));

  const rows = await sql`select sequence, position, hex(sealed) as sealed
    from record_attachments`.execute(ctx.db);

  expect(rows.rows).toStrictEqual([{ sequence: 1, position: 0, sealed: '0102' }]);
});

test('it refuses an update of an attachment', async () => {
  const ctx = await setupTest();

  await ctx.db.transaction().execute((tx) => recordAttachmentsMigration.up(tx));

  await sql`insert into record_attachments (sequence, position, sealed)
    values (1, 0, x'0102')`.execute(ctx.db);

  const update = sql`update record_attachments set sealed = x'03'`.execute(ctx.db);

  await Promise.allSettled([update]);

  expect(update).rejects.toThrowWithMessage(Error, 'record attachments are append-only');
});

test('it refuses a delete of an attachment', async () => {
  const ctx = await setupTest();

  await ctx.db.transaction().execute((tx) => recordAttachmentsMigration.up(tx));

  await sql`insert into record_attachments (sequence, position, sealed)
    values (1, 0, x'0102')`.execute(ctx.db);

  const remove = sql`delete from record_attachments`.execute(ctx.db);

  await Promise.allSettled([remove]);

  expect(remove).rejects.toThrowWithMessage(Error, 'record attachments are append-only');
});
