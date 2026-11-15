import { expect, test } from 'bun:test';
import { actionsProjection } from '@heynixie/actions';
import { apiProjections, proposalsProjection } from '@heynixie/api';
import { nixieSchema } from '@heynixie/db';
import { ruleFiresProjection } from '@heynixie/definitions';
import type { Log, RecordInput } from '@heynixie/log';
import {
  logProjections,
  runProjectionRebuild,
  withWriteTransaction,
  writeRecords,
} from '@heynixie/log';
import { memoryProjections } from '@heynixie/memory';
import { startTestMemoryWriter } from '@heynixie/memory/test-utils';
import { knownContactsProjection } from '@heynixie/policy';
import { sandboxesProjection } from '@heynixie/sandbox';
import { startTestServer } from '@heynixie/server/test-utils';
import { createSystemTask, readInbox, tasksProjections } from '@heynixie/tasks';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { runStubCheck, seedMemoryTaskData } from './test-utils/seed-memory-task-data';

async function setupTest() {
  const server = await startTestServer(undefined, { fakeGuest: true });
  const memory = await startTestMemoryWriter(server, { check: runStubCheck });

  const log: Log = {
    ...memory.context.log,
    projections: [
      ...logProjections,
      ...tasksProjections,
      actionsProjection,
      sandboxesProjection,
      ...apiProjections,
      ...memoryProjections,
      ruleFiresProjection,
      knownContactsProjection,
      proposalsProjection,
    ],
  };

  const migration = nixieSchema.migrations.find(
    (candidate) =>
      candidate.name === "rewrite the built-in memory tasks' records as the conversation's",
  );

  invariant(migration);

  const rowSchema = z.record(z.string(), z.unknown());

  return {
    createData: async () => {
      await seedMemoryTaskData({ server, memory, log });
      await runProjectionRebuild(log);
    },
    rebuild: () => runProjectionRebuild(log),
    writeRecords: (records: readonly RecordInput[]) => writeRecords(log, records),
    createTask: (taskID: string) =>
      createSystemTask({ definitions: memory.context.definitions, log }, taskID),
    readInbox: (taskID: string) => readInbox({ log }, taskID),
    runMigration: () => withWriteTransaction(log.writer, (tx) => migration.up(tx)),
    readForeignKeyViolations: async () => {
      const result = await sql`pragma foreign_key_check`.execute(log.writer.db);

      return result.rows;
    },
    readRows: async (table: string, key: string) => {
      const result = await sql`select * from ${sql.table(table)} order by ${sql.id(key)}`.execute(
        log.writer.db,
      );

      return z.array(rowSchema).parse(result.rows);
    },
    readKeys: async () => {
      const result = await sql`select sequence, kind, thread, key_id, hex(sealed) as sealed
        from records order by sequence`.execute(log.writer.db);

      return z.array(rowSchema).parse(result.rows);
    },
    readDump: async () => {
      const names = await sql`select name from sqlite_master
        where type = 'table' and name not like 'sqlite_%' order by name`.execute(log.writer.db);

      const tables = z.object({ name: z.string() }).array().parse(names.rows);
      const dump: Record<string, string[]> = {};

      for (const table of tables) {
        const result = await sql`select * from ${sql.table(table.name)}`.execute(log.writer.db);

        dump[table.name] = result.rows.map((row) => JSON.stringify(row)).toSorted();
      }

      return dump;
    },
  };
}

test('it gives the same rows after a projection rebuild as it left', async () => {
  const ctx = await setupTest();

  await ctx.createData();
  await ctx.runMigration();

  const migrated = await ctx.readDump();

  await ctx.rebuild();

  const rebuilt = await ctx.readDump();
  const violations = await ctx.readForeignKeyViolations();

  expect(rebuilt).toStrictEqual(migrated);
  expect(violations).toStrictEqual([]);
});

test('it changes no row when it runs a second time', async () => {
  const ctx = await setupTest();

  await ctx.createData();
  await ctx.runMigration();

  const migrated = await ctx.readDump();

  await ctx.runMigration();

  const again = await ctx.readDump();

  expect(again).toStrictEqual(migrated);
});

test('it leaves no row that names either task, its origin or a batch, outside the sandboxes', async () => {
  const ctx = await setupTest();

  await ctx.createData();

  const before = await ctx.readDump();

  await ctx.runMigration();

  const migrated = await ctx.readDump();

  const retiredText = ['memory_writer', 'memory-writer', 'memory-consolidator', 'batch/'];

  const stray = Object.entries(migrated).flatMap(([table, rows]) =>
    rows
      .filter((row) => retiredText.some((text) => row.includes(text)))
      .filter((row) => table !== 'sandboxes' && !row.includes('sandbox'))
      .map((row) => `${table}: ${row.slice(0, 160)}`),
  );

  expect(Object.values(before).flat().join('')).toContain('memory_writer');
  expect(stray).toStrictEqual([]);
  expect(migrated['sandboxes']).toHaveLength(1);
});

test('it keeps each memory item, version and proposal, with only its origin, task and grouping rewritten', async () => {
  const ctx = await setupTest();

  await ctx.createData();

  const items = await ctx.readRows('memory_items', 'item_id');
  const versions = await ctx.readRows('memory_versions', 'version_key');
  const proposals = await ctx.readRows('memory_proposals', 'proposal_id');

  await ctx.runMigration();

  const keptItems = await ctx.readRows('memory_items', 'item_id');
  const keptVersions = await ctx.readRows('memory_versions', 'version_key');
  const keptProposals = await ctx.readRows('memory_proposals', 'proposal_id');

  const expectedVersions = [];

  for (const row of versions) {
    const isChange = row['task_id'] === 'memory-consolidator';
    const isMoved = isChange || row['origin'] === 'memory_writer';

    const moved = {
      ...row,
      origin: 'conversation',
      task_id: 'conversation',
      proposal_id: isChange ? null : row['proposal_id'],
    };

    const expectedVersion = isMoved ? moved : row;

    expectedVersions.push(expectedVersion);
  }

  const expectedProposals = [];

  for (const row of proposals) {
    expectedProposals.push({
      ...row,
      origin: 'conversation',
      task_id: 'conversation',
      thread: 'conversation',
      cap_group: String(row['cap_group']).replace(
        /^batch\/\d+-(?<end>\d+)$/u,
        'turn/conversation/$<end>',
      ),
      notice_key: String(row['notice_key']).replace(
        /^batch\/\d+-(?<end>\d+)$/u,
        'turn/conversation/$<end>',
      ),
    });
  }

  expect(keptItems).toStrictEqual(items);
  expect(keptVersions).toStrictEqual(expectedVersions);
  expect(keptProposals).toStrictEqual(expectedProposals);

  expect(proposals.map((row) => row['status'])).toStrictEqual(
    expect.arrayContaining(['pending', 'consumed', 'rejected']),
  );
});

test('it keeps the key and the sealed fields of each record it keeps', async () => {
  const ctx = await setupTest();

  await ctx.createData();

  const before = await ctx.readKeys();

  await ctx.runMigration();

  const kept = await ctx.readKeys();

  const expected = [];

  for (const row of before) {
    if (kept.some((other) => other['sequence'] === row['sequence'])) {
      const isOnTask = ['memory-writer', 'memory-consolidator'].includes(String(row['thread']));
      const keptRow = isOnTask ? { ...row, thread: 'conversation' } : row;

      expected.push(keptRow);
    }
  }

  expect(kept.length).toBeLessThan(before.length);
  expect(kept).toStrictEqual(expected);
});

test('it keeps the moved memory records, the prompt records of other prompts and the sandbox records, and nothing else of the 2 tasks', async () => {
  const ctx = await setupTest();

  await ctx.createData();
  await ctx.runMigration();

  const records = await ctx.readKeys();

  const kinds = records.map((row) => `${String(row['kind'])}@${String(row['thread'])}`);
  const versionAdded = Array.from({ length: 6 }, () => 'memory.version_added@conversation');
  const proposed = Array.from({ length: 4 }, () => 'memory.proposed@conversation');

  expect(kinds.filter((kind) => kind.startsWith('memory.')).toSorted()).toStrictEqual(
    [
      ...versionAdded,
      ...proposed,
      'memory.approval_recorded@conversation',
      'memory.proposal_rejected@conversation',
      'memory.proposal_merged@conversation',
      'memory.recalled@null',
    ].toSorted(),
  );

  expect(kinds.filter((kind) => kind.startsWith('sandbox.'))).toStrictEqual([
    'sandbox.created@null',
    'sandbox.granted@null',
  ]);

  expect(kinds.filter((kind) => kind.startsWith('prompts.'))).toStrictEqual([
    'prompts.override_proposed@conversation',
    'prompts.override_rejected@conversation',
  ]);
});

test('it keeps a read cursor that sits on a record it removes, and the next read returns the records after it', async () => {
  const ctx = await setupTest();

  await ctx.createData();
  await ctx.createTask('tide-log');

  const definitions = { snapshotHash: 'sha256:test' };

  const [, notice] = await ctx.writeRecords([
    { kind: 'task.wake', definitions, thread: 'tide-log', payload: { at: 1 } },
    {
      kind: 'memory.notice',
      definitions,
      thread: 'tide-log',
      payload: { notice: 'batch', versions: [], count: 1, isQuiet: true },
    },
  ]);

  invariant(notice !== undefined);

  const [, after] = await ctx.writeRecords([
    {
      kind: 'task.step_committed',
      definitions,
      thread: 'tide-log',
      payload: {
        taskID: 'tide-log',
        nextState: 'ready',
        readCursor: notice.sequence,
        sessionBoundary: null,
        timers: [],
      },
    },
    { kind: 'task.wake', definitions, thread: 'tide-log', payload: { at: 2 } },
  ]);

  invariant(after !== undefined);

  await ctx.runMigration();

  const inbox = await ctx.readInbox('tide-log');

  expect(inbox.map((record) => record.sequence)).toStrictEqual([after.sequence]);
});
