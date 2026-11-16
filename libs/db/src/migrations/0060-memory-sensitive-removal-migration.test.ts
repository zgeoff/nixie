import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { z } from 'zod';
import { runMigrations } from '../migration/run-migrations';
import { readQueryRows } from '../read-query-rows';
import { nixieSchema } from '../schema/nixie-schema';
import { buildSqliteWorkerDialect } from '../sqlite/build-sqlite-worker-dialect';
import { readRunPrefix } from '../test-utils/read-run-prefix';
import { memorySensitiveRemovalMigration } from './0060-memory-sensitive-removal-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-sensitive-removal-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, {
    schema: {
      migrations: nixieSchema.migrations.slice(
        0,
        nixieSchema.migrations.indexOf(memorySensitiveRemovalMigration),
      ),
      oldestReader: 0,
    },
    copyDir: directory,
  });

  const writeRecord = async (
    kind: string,
    payload: object,
    options: { parent?: number } = {},
  ): Promise<number> => {
    const rows = await readQueryRows(
      sql`insert into records (recorded_at, kind, parent, snapshot_hash, payload)
        values (1, ${kind}, ${options.parent ?? null}, 'snapshot', ${JSON.stringify(payload)})
        returning sequence`,
      db,
      z.object({ sequence: z.number() }),
    );

    return rows[0]?.sequence ?? 0;
  };

  return {
    db,
    runMigration: () => runMigrations(db, { schema: nixieSchema, copyDir: directory }),
    writeRecord,
    writeChange: async (
      sequence: number,
      projection: string,
      rowKey: string,
      row: object,
    ): Promise<void> => {
      await sql`insert into projection_changes (sequence, projection, row_key, row)
        values (${sequence}, ${projection}, ${rowKey}, ${JSON.stringify(row)})`.execute(db);
    },
    writeProposal: async (proposalID: string, reason: string, sequence: number): Promise<void> => {
      await sql`insert into memory_proposals (proposal_id, item_id, is_new_item, operation,
          is_pinned, review_reason, status, action_hash, sealed, origin, source, cap_group,
          created_sequence, created_at, lapse_at, is_sensitive)
        values (${proposalID}, 'item1', 1, 'remember', 0, ${reason}, 'pending',
          ${`hash-${proposalID}`}, 'sealed', 'conversation', 'owner', 'cap', ${sequence}, 1000,
          2000, 1)`.execute(db);
    },
    writeCall: (tool: string): Promise<number> =>
      writeRecord('tool_called', { callID: 'c', runID: 'r', toolUseID: null, tool }),
    readKinds: async (): Promise<string[]> => {
      const rows = await readQueryRows(
        sql`select kind from records order by sequence`,
        db,
        z.object({ kind: z.string() }),
      );

      return rows.map((row) => row.kind);
    },
    readColumns: async (table: string): Promise<string[]> => {
      const rows = await readQueryRows(
        sql`select name from pragma_table_info(${table})`,
        db,
        z.object({ name: z.string() }),
      );

      return rows.map((row) => row.name);
    },
  };
}

test('it moves the schema to version 60', () => {
  expect(nixieSchema.migrations.indexOf(memorySensitiveRemovalMigration) + 1).toBe(60);
});

test('it drops the flag and keeps every other column of an item and of a pending proposal', async () => {
  const ctx = await setupTest();
  const sequence = await ctx.writeRecord('memory.proposed', {});

  await sql`insert into memory_items (item_id, version, state, is_pinned, created_sequence,
    updated_sequence, is_sensitive) values ('item1', 2, 'active', 1, ${sequence}, ${sequence}, 1)`.execute(
    ctx.db,
  );

  await ctx.writeProposal('p1', 'novel', sequence);
  await ctx.runMigration();

  const items = await sql`select item_id, version, state, is_pinned from memory_items`.execute(
    ctx.db,
  );

  const proposals = await sql`select proposal_id, item_id, review_reason, status, action_hash
    from memory_proposals`.execute(ctx.db);

  const itemColumns = await ctx.readColumns('memory_items');
  const proposalColumns = await ctx.readColumns('memory_proposals');

  expect(items.rows).toStrictEqual([
    { item_id: 'item1', version: 2, state: 'active', is_pinned: 1 },
  ]);

  expect(proposals.rows).toStrictEqual([
    {
      proposal_id: 'p1',
      item_id: 'item1',
      review_reason: 'novel',
      status: 'pending',
      action_hash: 'hash-p1',
    },
  ]);

  expect(itemColumns).not.toContain('is_sensitive');
  expect(proposalColumns).not.toContain('is_sensitive');
});

test('it removes both sensitive record kinds, a mark call with its result and a forget of a mark, and keeps every other record', async () => {
  const ctx = await setupTest();

  const marked = await ctx.writeRecord('memory.sensitive_marked', {
    itemID: 'item1',
    isSensitive: true,
  });

  await ctx.writeRecord('memory.proposal_sensitive_noted', { proposalID: 'p1' });
  await ctx.writeRecord('record.forgotten', { recordSequence: marked });

  const call = await ctx.writeCall('memory.mark_sensitive');

  await ctx.writeRecord(
    'tool_result',
    { callID: 'c', runID: 'r', toolUseID: null, outcome: 'result', actionID: null, sources: {} },
    { parent: call },
  );

  await ctx.writeCall('memory.recall');
  await ctx.writeRecord('memory.pinned', { itemID: 'item1' });
  await ctx.runMigration();

  const kinds = await ctx.readKinds();

  expect(kinds).toStrictEqual(['tool_called', 'memory.pinned']);
});

test('it removes the action proposal of a mark call, its row and its answer', async () => {
  const ctx = await setupTest();
  const call = await ctx.writeCall('memory.mark_sensitive');

  const proposed = await ctx.writeRecord('policy.action_proposed', {
    proposalID: 'a1',
    shortID: 'A1',
    callSequence: call,
    tool: 'memory.mark_sensitive',
    effects: ['note'],
    actionHash: 'h1',
    cause: 'no_rule',
  });

  await sql`insert into proposals (proposal_id, short_id, family, kind, risk_class, action_hash,
      cause, created_sequence, created_at, lapses_at, state)
    values ('a1', 'A1', 'action', 'action', 'routine', 'h1', 'no_rule', ${proposed}, 1000, 2000,
      'pending')`.execute(ctx.db);

  await ctx.writeRecord('policy.action_answered', {
    proposalID: 'a1',
    shortID: 'A1',
    answer: 'approved',
  });

  await ctx.runMigration();

  const kinds = await ctx.readKinds();
  const rows = await sql`select proposal_id from proposals`.execute(ctx.db);

  expect(kinds).toStrictEqual([]);
  expect(rows.rows).toStrictEqual([]);
});

test('it reads a stored sensitive reason as other in the record, the row and the change, and leaves another reason', async () => {
  const ctx = await setupTest();

  const proposed = await ctx.writeRecord('memory.proposed', {
    proposalID: 'p1',
    actionHash: 'hash-p1',
    reviewReason: 'sensitive',
    lapseAt: 2000,
  });

  const kept = await ctx.writeRecord('memory.proposed', {
    proposalID: 'p2',
    actionHash: 'hash-p2',
    reviewReason: 'novel',
    lapseAt: 2000,
  });

  await ctx.writeProposal('p1', 'sensitive', proposed);
  await ctx.writeProposal('p2', 'novel', kept);

  await ctx.writeChange(proposed, 'memory_proposals', 'p1', {
    proposal_id: 'p1',
    review_reason: 'sensitive',
    is_sensitive: 1,
    status: 'pending',
  });

  await ctx.writeChange(kept, 'memory_proposals', 'p2', {
    proposal_id: 'p2',
    review_reason: 'novel',
    is_sensitive: 0,
    status: 'pending',
  });

  await ctx.runMigration();

  const records = await sql`select payload from records order by sequence`.execute(ctx.db);

  const rows = await sql`select proposal_id, review_reason from memory_proposals
    order by proposal_id`.execute(ctx.db);

  const changes = await sql`select row from projection_changes order by sequence`.execute(ctx.db);

  expect(records.rows).toStrictEqual([
    {
      payload: '{"proposalID":"p1","actionHash":"hash-p1","reviewReason":"other","lapseAt":2000}',
    },
    {
      payload: '{"proposalID":"p2","actionHash":"hash-p2","reviewReason":"novel","lapseAt":2000}',
    },
  ]);

  expect(rows.rows).toStrictEqual([
    { proposal_id: 'p1', review_reason: 'other' },
    { proposal_id: 'p2', review_reason: 'novel' },
  ]);

  expect(changes.rows).toStrictEqual([
    { row: '{"proposal_id":"p1","review_reason":"other","status":"pending"}' },
    { row: '{"proposal_id":"p2","review_reason":"novel","status":"pending"}' },
  ]);
});

test('it removes the flag from the item changes', async () => {
  const ctx = await setupTest();
  const sequence = await ctx.writeRecord('memory.version_added', {});

  await ctx.writeChange(sequence, 'memory_items', 'item1', {
    item_id: 'item1',
    is_sensitive: 1,
    state: 'active',
  });

  await ctx.runMigration();

  const changes = await sql`select row from projection_changes`.execute(ctx.db);

  expect(changes.rows).toStrictEqual([{ row: '{"item_id":"item1","state":"active"}' }]);
});

test('it removes the client actions of the mark procedure and keeps another procedure', async () => {
  const ctx = await setupTest();

  await sql`insert into client_actions (client_action_id, procedure, result, recorded_at) values
    ('c1', 'memory.markSensitive', '{}', 1), ('c2', 'memory.pin', '{}', 1)`.execute(ctx.db);

  await ctx.runMigration();

  const rows = await sql`select client_action_id from client_actions`.execute(ctx.db);

  expect(rows.rows).toStrictEqual([{ client_action_id: 'c2' }]);
});

test('it changes only the dropped columns of a database with no sensitive data', async () => {
  const ctx = await setupTest();

  await ctx.writeCall('memory.recall');
  await ctx.runMigration();

  const kinds = await ctx.readKinds();

  expect(kinds).toStrictEqual(['tool_called']);
});

test('it changes nothing when it runs a second time', async () => {
  const ctx = await setupTest();

  await ctx.runMigration();
  await ctx.db.transaction().execute((tx) => memorySensitiveRemovalMigration.up(tx));

  const columns = await ctx.readColumns('memory_items');

  expect(columns).not.toContain('is_sensitive');
});
