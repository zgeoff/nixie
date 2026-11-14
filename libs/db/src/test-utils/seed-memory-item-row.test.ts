import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'kysely';
import { nixieSchema } from '../nixie-schema';
import { runMigrations } from '../run-migrations';
import { startDatabase } from '../start-database';
import { seedMemoryItemRow } from './seed-memory-item-row';
import { seedRecordRow } from './seed-record-row';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-row-seed-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = startDatabase(join(directory, 'nixie.db'));

  stack.defer(() => db.destroy());

  await runMigrations(db, { schema: nixieSchema, copyDir: directory });

  return { db };
}

test('it inserts an active item of the subject it is given', async () => {
  const ctx = await setupTest();

  await seedRecordRow(ctx.db);

  const item = await seedMemoryItemRow(ctx.db, { subject: 'shared' });

  const rows = await sql`select item_id, short_id, state, subject from memory_items`.execute(
    ctx.db,
  );

  expect(rows.rows).toStrictEqual([
    { item_id: item.itemID, short_id: item.shortID, state: 'active', subject: 'shared' },
  ]);
});

test('it inserts an item with no subject when it is given null', async () => {
  const ctx = await setupTest();

  await seedRecordRow(ctx.db);
  await seedMemoryItemRow(ctx.db, { kind: 'self', subject: null });

  const rows = await sql`select kind, subject from memory_items`.execute(ctx.db);

  expect(rows.rows).toStrictEqual([{ kind: 'self', subject: null }]);
});
