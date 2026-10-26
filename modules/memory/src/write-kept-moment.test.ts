import { expect, test } from 'bun:test';
import { readRecords, writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { memoryWriterTaskID } from './memory-writer-task-id';
import type { MomentTables } from './moment-types';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  const memory = await startTestMemory();

  return { memory, db: memory.writer.db.$extendTables<MomentTables>() };
}

test('it keeps a span of the caller own thread with its title under the record key', async () => {
  const ctx = await setupTest();

  const [first, last] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'who left the kettle on the stove' },
    },
    {
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the kettle was on the stove since nine' },
    },
  ]);

  invariant(first && last);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    thread: 'conversation',
    firstSequence: first.sequence,
    lastSequence: last.sequence,
    title: 'The kettle argument',
  });

  invariant(kept.status === 'written');

  const row = await ctx.db.selectFrom('moments').selectAll().executeTakeFirstOrThrow();

  const [record] = await readRecords(ctx.memory.log, {
    afterSequence: kept.sequence - 1,
    limit: 1,
  });

  expect(row).toStrictEqual({
    moment_id: kept.momentID,
    short_id: kept.shortID,
    thread: 'conversation',
    first_sequence: first.sequence,
    last_sequence: last.sequence,
    state: 'active',
    version: 1,
    kept_by: 'model',
    kept_thread: 'conversation',
    kept_model: 'claude-test-4',
    kept_at: expect.any(Number),
    kept_sequence: kept.sequence,
    title_sequence: kept.sequence,
    note_sequence: null,
    edited_at: null,
    updated_sequence: kept.sequence,
  });

  expect(record?.record.erasable).toStrictEqual({
    status: 'readable',
    fields: { title: 'The kettle argument' },
  });
});

test('it refuses a keep from the memory writer', async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'task.wake',
      definitions: { snapshotHash: 'sha256:test' },
      thread: memoryWriterTaskID,
      payload: {},
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'model', thread: memoryWriterTaskID, model: 'claude-test-4' },
    thread: memoryWriterTaskID,
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'A batch worth keeping',
  });

  expect(kept).toStrictEqual({ status: 'refused', reason: 'memory_writer' });
});

test("it refuses a task's keep of a span of the conversation", async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the plants need water on Friday' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'model', thread: 'morning-reading', model: 'claude-test-4' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The watering plan',
  });

  expect(kept).toStrictEqual({ status: 'refused', reason: 'other_thread' });
});

test('it refuses a span whose last edge sits on another thread', async () => {
  const ctx = await setupTest();

  const [first, last] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the plants need water on Friday' },
    },
    {
      kind: 'task.wake',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'morning-reading',
      payload: {},
    },
  ]);

  invariant(first && last);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    thread: 'conversation',
    firstSequence: first.sequence,
    lastSequence: last.sequence,
    title: 'The watering plan',
  });

  expect(kept).toStrictEqual({ status: 'refused', reason: 'bad_span' });
});

test('it refuses a span whose first edge comes after its last', async () => {
  const ctx = await setupTest();

  const [first, last] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the plants need water on Friday' },
    },
    {
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'I will remind you on Friday' },
    },
  ]);

  invariant(first && last);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: last.sequence,
    lastSequence: first.sequence,
    title: 'The watering plan',
  });

  expect(kept).toStrictEqual({ status: 'refused', reason: 'bad_span' });
});

test("it lets the owner keep a span of a task's thread", async () => {
  const ctx = await setupTest();

  const [wake] = await writeRecords(ctx.memory.log, [
    {
      kind: 'task.wake',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'morning-reading',
      payload: {},
    },
  ]);

  invariant(wake);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'owner' },
    thread: 'morning-reading',
    firstSequence: wake.sequence,
    lastSequence: wake.sequence,
    title: 'The first morning reading',
  });

  invariant(kept.status === 'written');

  const row = await ctx.db
    .selectFrom('moments')
    .select(['thread', 'kept_by', 'kept_thread', 'kept_model'])
    .executeTakeFirstOrThrow();

  expect(row).toStrictEqual({
    thread: 'morning-reading',
    kept_by: 'owner',
    kept_thread: null,
    kept_model: null,
  });
});
