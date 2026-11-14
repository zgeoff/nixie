import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'kysely';
import { nixieSchema } from '../nixie-schema';
import { runMigrations } from '../run-migrations';
import { startDatabase } from '../start-database';
import { seedNixiePauseRow } from './seed-nixie-pause-row';
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

test('it inserts the owner pause at the sequence it is given', async () => {
  const ctx = await setupTest();

  await seedRecordRow(ctx.db, { sequence: 3, kind: 'nixie.paused' });
  await seedNixiePauseRow(ctx.db, { pausedSequence: 3 });

  const rows = await sql`select id, cause, paused_sequence from nixie_pause`.execute(ctx.db);

  expect(rows.rows).toStrictEqual([{ id: 1, cause: 'owner', paused_sequence: 3 }]);
});
