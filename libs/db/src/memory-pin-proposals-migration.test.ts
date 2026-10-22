import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { buildSqliteWorkerDialect } from './build-sqlite-worker-dialect';
import { memoryPinProposalsMigration } from './memory-pin-proposals-migration';
import { nixieSchema } from './nixie-schema';
import { runMigrations } from './run-migrations';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-memory-pin-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, {
    schema: {
      migrations: nixieSchema.migrations.slice(
        0,
        nixieSchema.migrations.indexOf(memoryPinProposalsMigration),
      ),
      oldestReader: 0,
    },
    copyDir: directory,
  });

  return { db, directory };
}

test('it moves the schema to version 25, which the release before cannot read', () => {
  expect(nixieSchema.migrations.indexOf(memoryPinProposalsMigration) + 1).toBe(25);
  expect(nixieSchema.oldestReader).toBe(25);
});

test('it keeps each proposal of a database it upgrades, and the merges that name one', async () => {
  const ctx = await setupTest();

  await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
    values (1, 1767225600000, 'memory.proposed', 'snapshot-a', '{}')`.execute(ctx.db);

  await sql`insert into memory_proposals (proposal_id, item_id, is_new_item, operation,
    target_version, is_pinned, review_reason, status, action_hash, sealed, origin, source, cap_group,
    created_sequence, created_at, lapse_at, kind, subject) values
    ('5a0e7c3d-2b9f-4f61-a8d4-3c6e1b7f0a92', '8d2e4b71-0c5f-4e9a-b3d6-1f7a9c2e5b80', 1, 'remember',
      null, 0, 'checker_unsure', 'pending', 'hash-a', 'sealed-a', 'conversation', 'untrusted',
      'group-a', 1, 1767225600000, 1767830400000, 'fact', 'shared')`.execute(ctx.db);

  await sql`insert into memory_proposal_merges (merge_id, proposal_id, origin, sequence,
    recorded_at) values
    ('merge-a', '5a0e7c3d-2b9f-4f61-a8d4-3c6e1b7f0a92', 'memory_writer', 1, 1767225600000)`.execute(
    ctx.db,
  );

  await runMigrations(ctx.db, { schema: nixieSchema, copyDir: ctx.directory });

  const proposals = await sql`select proposal_id, operation, status, kind, subject
    from memory_proposals`.execute(ctx.db);

  const broken = await sql`select * from pragma_foreign_key_check`.execute(ctx.db);

  expect(proposals.rows).toStrictEqual([
    {
      proposal_id: '5a0e7c3d-2b9f-4f61-a8d4-3c6e1b7f0a92',
      operation: 'remember',
      status: 'pending',
      kind: 'fact',
      subject: 'shared',
    },
  ]);

  expect(broken.rows).toStrictEqual([]);
});

test('it stores a pin proposal, and keeps the indexes by status and by cap group', async () => {
  const ctx = await setupTest();

  await runMigrations(ctx.db, { schema: nixieSchema, copyDir: ctx.directory });

  await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
    values (1, 1767225600000, 'memory.proposed', 'snapshot-a', '{}')`.execute(ctx.db);

  await sql`insert into memory_proposals (proposal_id, item_id, is_new_item, operation,
    target_version, is_pinned, review_reason, status, action_hash, sealed, origin, source, cap_group,
    created_sequence, created_at, lapse_at) values
    ('c1f9e2a4-7b3d-4e8a-9f60-2d5b8c1e4a73', '8d2e4b71-0c5f-4e9a-b3d6-1f7a9c2e5b80', 0, 'pin', 2, 1,
      'pinned', 'pending', 'hash-b', 'sealed-b', 'conversation', 'untrusted', 'group-b', 1,
      1767225600000, 1767830400000)`.execute(ctx.db);

  const proposals = await sql`select operation, kind, subject from memory_proposals`.execute(
    ctx.db,
  );

  const indexes = await sql`select name from pragma_index_list('memory_proposals')
    where origin = 'c' order by name`.execute(ctx.db);

  expect(proposals.rows).toStrictEqual([{ operation: 'pin', kind: 'fact', subject: null }]);

  expect(indexes.rows).toStrictEqual([
    { name: 'memory_proposals_by_cap_group' },
    { name: 'memory_proposals_by_status' },
  ]);
});

test('it keeps each proposal when it runs again', async () => {
  const ctx = await setupTest();

  await runMigrations(ctx.db, { schema: nixieSchema, copyDir: ctx.directory });

  await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
    values (1, 1767225600000, 'memory.proposed', 'snapshot-a', '{}')`.execute(ctx.db);

  await sql`insert into memory_proposals (proposal_id, item_id, is_new_item, operation,
    target_version, is_pinned, review_reason, status, action_hash, sealed, origin, source, cap_group,
    created_sequence, created_at, lapse_at) values
    ('5a0e7c3d-2b9f-4f61-a8d4-3c6e1b7f0a92', '8d2e4b71-0c5f-4e9a-b3d6-1f7a9c2e5b80', 0, 'pin', 2, 1,
      'pinned', 'pending', 'hash-a', 'sealed-a', 'conversation', 'untrusted', 'group-a', 1,
      1767225600000, 1767830400000)`.execute(ctx.db);

  await ctx.db.transaction().execute((tx) => memoryPinProposalsMigration.up(tx));

  const proposals = await sql`select proposal_id from memory_proposals`.execute(ctx.db);

  expect(proposals.rows).toStrictEqual([{ proposal_id: '5a0e7c3d-2b9f-4f61-a8d4-3c6e1b7f0a92' }]);
});
