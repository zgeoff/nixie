import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'kysely';
import { startDatabase } from '../database/start-database';
import { runMigrations } from '../migration/run-migrations';
import { nixieSchema } from '../schema/nixie-schema';
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

test('it inserts a record row with the sequence and kind it is given', async () => {
  const ctx = await setupTest();

  await seedRecordRow(ctx.db, { sequence: 4, kind: 'memory.proposal_created' });

  const rows = await sql`select sequence, kind from records`.execute(ctx.db);

  expect(rows.rows).toStrictEqual([{ sequence: 4, kind: 'memory.proposal_created' }]);
});
