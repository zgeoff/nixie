import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { runMigrations } from '../migration/run-migrations';
import { nixieSchema } from '../schema/nixie-schema';
import { buildSqliteWorkerDialect } from '../sqlite/build-sqlite-worker-dialect';
import { readRunPrefix } from '../test-utils/read-run-prefix';
import { imagesMigration } from './0076-images-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-images-migration-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, { schema: nixieSchema, copyDir: directory });

  return { db };
}

test('it moves the schema to version 76', () => {
  expect(nixieSchema.migrations.indexOf(imagesMigration) + 1).toBe(76);
});

test('it creates the table that holds each image the tools stored', async () => {
  const ctx = await setupTest();

  const columns = await sql`select name from pragma_table_info('images') order by cid`.execute(
    ctx.db,
  );

  expect(columns.rows).toStrictEqual([
    { name: 'image_id' },
    { name: 'uuid' },
    { name: 'sequence' },
    { name: 'position' },
    { name: 'parent_id' },
    { name: 'source' },
    { name: 'source_seq' },
    { name: 'is_pinned' },
    { name: 'profile' },
    { name: 'model' },
    { name: 'media_type' },
    { name: 'size' },
    { name: 'byte_count' },
    { name: 'created_at' },
  ]);
});

test('it keeps each image when it runs again', async () => {
  const ctx = await setupTest();

  await sql`pragma foreign_keys = off`.execute(ctx.db);

  await sql`insert into images (image_id, uuid, sequence, position, source, media_type, size, byte_count, created_at)
    values ('k3x9m2p7qa', 'a-uuid', 9, 0, 'draw', 'image/png', '1024x1024', 10, 1)`.execute(ctx.db);

  await ctx.db.transaction().execute((tx) => imagesMigration.up(tx));

  const images = await sql`select image_id, is_pinned from images`.execute(ctx.db);

  expect(images.rows).toStrictEqual([{ image_id: 'k3x9m2p7qa', is_pinned: 0 }]);
});
