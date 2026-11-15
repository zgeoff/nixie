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
import { memoryConsolidationRemovalMigration } from './0055-memory-consolidation-removal-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-consolidation-removal-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, {
    schema: {
      migrations: nixieSchema.migrations.slice(
        0,
        nixieSchema.migrations.indexOf(memoryConsolidationRemovalMigration),
      ),
      oldestReader: 0,
    },
    copyDir: directory,
  });

  const writeRecord = async (
    kind: string,
    payload: object,
    options: { parent?: number; thread?: string } = {},
  ): Promise<number> => {
    const rows = await readQueryRows(
      sql`insert into records (recorded_at, kind, thread, parent, snapshot_hash, payload)
        values (1, ${kind}, ${options.thread ?? null}, ${options.parent ?? null}, 'snapshot',
          ${JSON.stringify(payload)})
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
    writeCall: (tool: string): Promise<number> =>
      writeRecord('tool_called', { callID: 'c', runID: 'r', toolUseID: null, tool }),
    writeResult: (parent: number): Promise<number> =>
      writeRecord(
        'tool_result',
        {
          callID: 'c',
          runID: 'r',
          toolUseID: null,
          outcome: 'result',
          actionID: null,
          sources: {},
        },
        { parent },
      ),
    writeProposalRow: async (proposalID: string, createdSequence: number): Promise<void> => {
      await sql`insert into proposals (
          proposal_id, short_id, family, kind, risk_class, action_hash, cause,
          created_sequence, created_at, lapses_at, state
        ) values (
          ${proposalID}, ${proposalID}, 'action', 'action', 'routine', 'hash', 'no_rule',
          ${createdSequence}, 1000, 2000, 'pending'
        )`.execute(db);
    },
    readProposalIDs: async (): Promise<string[]> => {
      const rows = await readQueryRows(
        sql`select proposal_id from proposals order by proposal_id`,
        db,
        z.object({ proposal_id: z.string() }),
      );

      return rows.map((row) => row.proposal_id);
    },
    readKinds: async (): Promise<string[]> => {
      const rows = await readQueryRows(
        sql`select kind from records order by sequence`,
        db,
        z.object({ kind: z.string() }),
      );

      return rows.map((row) => row.kind);
    },
    readTables: async (): Promise<string[]> => {
      const rows = await readQueryRows(
        sql`select name from sqlite_master where type = 'table' and name like 'memory_consolidation%'
          order by name`,
        db,
        z.object({ name: z.string() }),
      );

      return rows.map((row) => row.name);
    },
  };
}

test('it drops the 2 consolidation tables', async () => {
  const ctx = await setupTest();
  const before = await ctx.readTables();

  await ctx.runMigration();

  const after = await ctx.readTables();

  expect(before).toStrictEqual(['memory_consolidation_changes', 'memory_consolidations']);
  expect(after).toStrictEqual([]);
});

test('it removes the calls and the results of the diff and comment tools and keeps another tool', async () => {
  const ctx = await setupTest();
  const diff = await ctx.writeCall('memory.diff');

  await ctx.writeResult(diff);

  const comment = await ctx.writeCall('memory.comment');

  await ctx.writeResult(comment);

  const recall = await ctx.writeCall('memory.recall');

  await ctx.writeResult(recall);
  await ctx.runMigration();

  const kinds = await ctx.readKinds();

  expect(kinds).toStrictEqual(['tool_called', 'tool_result']);
});

test('it removes the action proposal of a removed call, its row, its answer and its defer', async () => {
  const ctx = await setupTest();
  const comment = await ctx.writeCall('memory.comment');

  const proposed = await ctx.writeRecord('policy.action_proposed', {
    proposalID: 'p1',
    shortID: 'A1',
    callSequence: comment,
    tool: 'memory.comment',
    effects: ['note'],
    actionHash: 'h1',
    cause: 'no_rule',
  });

  await ctx.writeProposalRow('p1', proposed);
  await ctx.writeProposalRow('p2', 999);

  await ctx.writeRecord('policy.action_answered', {
    proposalID: 'p1',
    shortID: 'A1',
    answer: 'approved',
  });

  await ctx.writeRecord('proposals.deferred', { proposalID: 'p1' });
  await ctx.writeRecord('policy.action_lapsed', { proposalID: 'p2' });
  await ctx.runMigration();

  const kinds = await ctx.readKinds();
  const proposalIDs = await ctx.readProposalIDs();

  expect(kinds).toStrictEqual(['policy.action_lapsed']);
  expect(proposalIDs).toStrictEqual(['p2']);
});

test('it stops and changes nothing when a kept record has a removed call as its parent', async () => {
  const ctx = await setupTest();
  const diff = await ctx.writeCall('memory.diff');

  await ctx.writeRecord('model.input_opened', { inputID: 'i1' }, { parent: diff });

  const [outcome] = await Promise.allSettled([ctx.runMigration()]);
  const kinds = await ctx.readKinds();
  const tables = await ctx.readTables();

  expect(outcome.status).toBe('rejected');
  expect(kinds).toStrictEqual(['tool_called', 'model.input_opened']);
  expect(tables).toStrictEqual(['memory_consolidation_changes', 'memory_consolidations']);
});

test('it changes nothing when it runs a second time', async () => {
  const ctx = await setupTest();

  await ctx.writeCall('memory.recall');
  await ctx.runMigration();
  await ctx.db.transaction().execute((tx) => memoryConsolidationRemovalMigration.up(tx));

  const kinds = await ctx.readKinds();
  const tables = await ctx.readTables();

  expect(kinds).toStrictEqual(['tool_called']);
  expect(tables).toStrictEqual([]);
});
