import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'kysely';
import { startDatabase } from '../database/start-database';
import { runMigrations } from '../migration/run-migrations';
import { nixieSchema } from '../schema/nixie-schema';
import { seedMemoryProposalRow } from './seed-memory-proposal-row';
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

test('it inserts a pending proposal of the subject it is given', async () => {
  const ctx = await setupTest();

  await seedRecordRow(ctx.db);

  const proposal = await seedMemoryProposalRow(ctx.db, {
    subject: 'self',
    reviewReason: 'self_note',
  });

  const rows = await sql`select proposal_id, review_reason, subject
    from memory_proposals`.execute(ctx.db);

  expect(rows.rows).toStrictEqual([
    {
      proposal_id: proposal.proposalID,
      review_reason: 'self_note',
      subject: 'self',
    },
  ]);
});
