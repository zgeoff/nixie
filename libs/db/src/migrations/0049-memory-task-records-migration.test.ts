import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'kysely';
import { z } from 'zod';
import { startDatabase } from '../database/start-database';
import { runMigrations } from '../migration/run-migrations';
import { readQueryRows } from '../read-query-rows';
import { nixieSchema } from '../schema/nixie-schema';
import { readRunPrefix } from '../test-utils/read-run-prefix';
import { memoryTaskRecordsMigration } from './0049-memory-task-records-migration';

interface RecordRow {
  readonly kind: string;
  readonly thread?: string;
  readonly stepKey?: string;
  readonly parent?: number;
  readonly payload: unknown;
}

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-memory-task-records-migration-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = startDatabase(join(directory, 'nixie.db'));

  stack.defer(() => db.destroy());

  await runMigrations(db, { schema: nixieSchema, copyDir: directory });

  return {
    db,
    writeRecord: async (record: RecordRow) => {
      await sql`insert into records (recorded_at, kind, thread, step_key, parent, snapshot_hash, payload)
        values (1, ${record.kind}, ${record.thread ?? null}, ${record.stepKey ?? null},
          ${record.parent ?? null}, 'snapshot', ${JSON.stringify(record.payload)})`.execute(db);
    },
    runMigration: () => db.transaction().execute((tx) => memoryTaskRecordsMigration.up(tx)),
    readRecords: () =>
      readQueryRows(
        sql`select sequence, kind, thread, step_key, payload from records order by sequence`,
        db,
        z.object({
          sequence: z.number(),
          kind: z.string(),
          thread: z.string().nullable(),
          step_key: z.string().nullable(),
          payload: z.string(),
        }),
      ),
  };
}

test('it moves the schema to version 49, which the release before cannot read', () => {
  expect(nixieSchema.migrations.indexOf(memoryTaskRecordsMigration) + 1).toBe(49);
  expect(nixieSchema.oldestReader).toBeGreaterThanOrEqual(49);
});

test('it rewrites a consolidation version as a conversation version and removes the change records', async () => {
  const ctx = await setupTest();

  await ctx.writeRecord({
    kind: 'memory.version_added',
    thread: 'memory-consolidator',
    stepKey: 'memory-consolidator:2',
    payload: {
      itemID: 'item-1',
      origin: 'task',
      taskID: 'memory-consolidator',
      proposalID: 'change-1',
      noticeKey: null,
    },
  });

  await ctx.writeRecord({
    kind: 'memory.consolidation_approved',
    thread: 'memory-consolidator',
    payload: { changeID: 'change-1' },
  });

  await ctx.runMigration();

  const records = await ctx.readRecords();

  expect(records).toStrictEqual([
    {
      sequence: 1,
      kind: 'memory.version_added',
      thread: 'conversation',
      step_key: null,
      payload:
        '{"itemID":"item-1","origin":"conversation","taskID":"conversation","proposalID":null,"noticeKey":null}',
    },
  ]);
});

test('it turns the batch key of a note-taker proposal into the key of the turn that ends it', async () => {
  const ctx = await setupTest();

  await ctx.writeRecord({
    kind: 'memory.proposed',
    thread: 'memory-writer',
    payload: {
      proposalID: 'proposal-1',
      origin: 'memory_writer',
      taskID: 'memory-writer',
      capGroup: 'batch/12-40',
      noticeKey: 'batch/12-40',
    },
  });

  await ctx.runMigration();

  const records = await ctx.readRecords();

  const payload = z.record(z.string(), z.unknown()).parse(JSON.parse(records[0]?.payload ?? '{}'));
  const turnGroup = 'turn/conversation/40';

  expect(records[0]?.thread).toBe('conversation');

  expect(payload).toStrictEqual({
    proposalID: 'proposal-1',
    origin: 'conversation',
    taskID: 'conversation',
    capGroup: turnGroup,
    noticeKey: turnGroup,
  });
});

test('it keeps the sandbox records of the 2 tasks and the records of the conversation', async () => {
  const ctx = await setupTest();

  await ctx.writeRecord({
    kind: 'sandbox.created',
    payload: { sandboxID: 's1', spec: { owner: 'memory-writer' } },
  });

  await ctx.writeRecord({ kind: 'owner_message', thread: 'conversation', payload: {} });
  await ctx.runMigration();

  const records = await ctx.readRecords();

  expect(records.map((record) => record.kind)).toStrictEqual(['sandbox.created', 'owner_message']);
});

test('it removes the record that forgets a removed record', async () => {
  const ctx = await setupTest();

  await ctx.writeRecord({ kind: 'memory.writer_started', thread: 'memory-writer', payload: {} });
  await ctx.writeRecord({ kind: 'record.forget_started', payload: { recordSequence: 1 } });
  await ctx.writeRecord({ kind: 'record.forget_started', payload: { recordSequence: 99 } });
  await ctx.runMigration();

  const records = await ctx.readRecords();

  expect(records).toMatchObject([{ kind: 'record.forget_started' }]);
});

test('it refuses a message from a memory task to another task and changes nothing', async () => {
  const ctx = await setupTest();

  await ctx.writeRecord({
    kind: 'task_message',
    thread: 'conversation',
    payload: { from: 'memory-writer', to: 'conversation' },
  });

  const run = ctx.runMigration();

  await run.catch(() => {});

  const records = await ctx.readRecords();

  expect(run).rejects.toThrow(/message from a built-in memory task/u);
  expect(records).toHaveLength(1);
});

test('it refuses a kept record whose parent it would remove', async () => {
  const ctx = await setupTest();

  await ctx.writeRecord({ kind: 'tool_called', thread: 'memory-writer', payload: {} });

  await ctx.writeRecord({
    kind: 'owner_message',
    thread: 'conversation',
    parent: 1,
    payload: {},
  });

  const run = ctx.runMigration();

  await run.catch(() => {});

  expect(run).rejects.toThrow(/through parent/u);
});

test('it changes no row when it runs on a database that holds no trace of either task', async () => {
  const ctx = await setupTest();

  await ctx.writeRecord({ kind: 'owner_message', thread: 'conversation', payload: {} });
  await ctx.runMigration();

  const records = await ctx.readRecords();

  expect(records).toMatchObject([{ kind: 'owner_message' }]);
});

test('it refuses a kept record whose payload points at a record it would remove', async () => {
  const ctx = await setupTest();

  await ctx.writeRecord({ kind: 'memory.batch_planned', thread: 'memory-writer', payload: {} });

  await ctx.writeRecord({
    kind: 'memory.version_added',
    thread: 'conversation',
    payload: { itemID: 'item-1', evidenceSequences: [1] },
  });

  const run = ctx.runMigration();

  await run.catch(() => {});

  const records = await ctx.readRecords();

  expect(run).rejects.toThrow(/through \$\.evidenceSequences\[0\]/u);
  expect(records).toHaveLength(2);
});

test('it keeps a record that only mentions a task ID as free text', async () => {
  const ctx = await setupTest();

  await ctx.writeRecord({
    kind: 'prompts.override_proposed',
    thread: 'conversation',
    payload: { proposalID: 'p1', promptID: 'persona', reason: 'memory-writer' },
  });

  await ctx.runMigration();

  const records = await ctx.readRecords();

  expect(records).toMatchObject([{ kind: 'prompts.override_proposed' }]);
});
