import { expect, test } from 'bun:test';
import { readRecords, withWriteTransaction, writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { taskCreatedCodec } from '../task/codec/task-created-codec';
import { taskDefinitionSetCodec } from '../task/codec/task-definition-set-codec';
import { startTestTasks } from '../test-utils/start-test-tasks';
import type { TasksTables } from '../types';
import { writeDefinitionTasksInTransaction } from './write-definition-tasks-in-transaction';

async function setupTest() {
  const tasks = await startTestTasks();

  return {
    ...tasks,
    db: tasks.writer.db.$extendTables<TasksTables>(),
    writeTasks: (inForce: readonly { definitionID: string; definitionHash: string }[]) =>
      withWriteTransaction(tasks.writer, (tx) =>
        writeDefinitionTasksInTransaction(tx, tasks.context, inForce),
      ),
    readTasks: () =>
      tasks.writer.db
        .$extendTables<TasksTables>()
        .selectFrom('tasks')
        .select(['task_id', 'state', 'started_by', 'definition_id', 'definition_hash'])
        .orderBy('created_sequence')
        .execute(),
    readKinds: async () => {
      const entries = await readRecords(tasks.context.log, { afterSequence: 0 });

      return entries.map((entry) => entry.record.kind);
    },
  };
}

test('it creates one task and one binding for a definition that has none', async () => {
  const ctx = await setupTest();

  const written = await ctx.writeTasks([
    { definitionID: 'water-the-tomatoes', definitionHash: 'hash-1' },
  ]);

  expect(written).toStrictEqual({ created: 1, set: 0, withdrawn: 0 });

  const result = await ctx.readTasks();

  expect(result).toStrictEqual([
    {
      task_id: expect.toBeString(),
      state: 'waiting',
      started_by: null,
      definition_id: 'water-the-tomatoes',
      definition_hash: 'hash-1',
    },
  ]);
});

test('it writes a task with no starter, no options and no brief', async () => {
  const ctx = await setupTest();

  await ctx.writeTasks([{ definitionID: 'water-the-tomatoes', definitionHash: 'hash-1' }]);

  const [created] = await readRecords(ctx.context.log, { afterSequence: 0 });

  expect(created?.record.kind).toBe('task.created');

  expect(taskCreatedCodec.decode(created?.record.payload ?? {})).toStrictEqual({
    taskID: expect.toBeString(),
    isConversation: false,
    state: 'waiting',
  });
});

test('it writes no record when the list repeats the hash a task holds', async () => {
  const ctx = await setupTest();

  await ctx.writeTasks([{ definitionID: 'water-the-tomatoes', definitionHash: 'hash-1' }]);

  const before = await ctx.readKinds();

  const written = await ctx.writeTasks([
    { definitionID: 'water-the-tomatoes', definitionHash: 'hash-1' },
  ]);

  expect(written).toStrictEqual({ created: 0, set: 0, withdrawn: 0 });

  const result = await ctx.readKinds();

  expect(result).toStrictEqual(before);
});

test('it sets the new hash on the task of a definition whose hash changed', async () => {
  const ctx = await setupTest();

  await ctx.writeTasks([{ definitionID: 'water-the-tomatoes', definitionHash: 'hash-1' }]);

  const written = await ctx.writeTasks([
    { definitionID: 'water-the-tomatoes', definitionHash: 'hash-2' },
  ]);

  expect(written).toStrictEqual({ created: 0, set: 1, withdrawn: 0 });

  const result = await ctx.readTasks();

  expect(result).toMatchObject([{ definition_hash: 'hash-2' }]);
});

test('it gives a null hash to the task of a definition left out of the list', async () => {
  const ctx = await setupTest();

  await ctx.writeTasks([{ definitionID: 'water-the-tomatoes', definitionHash: 'hash-1' }]);

  const written = await ctx.writeTasks([]);

  expect(written).toStrictEqual({ created: 0, set: 0, withdrawn: 1 });

  const result = await ctx.readTasks();

  expect(result).toMatchObject([{ definition_hash: null }]);
});

test('it writes nothing for a definition left out that already holds no hash', async () => {
  const ctx = await setupTest();

  await ctx.writeTasks([{ definitionID: 'water-the-tomatoes', definitionHash: 'hash-1' }]);
  await ctx.writeTasks([]);

  const before = await ctx.readKinds();
  const written = await ctx.writeTasks([]);

  expect(written).toStrictEqual({ created: 0, set: 0, withdrawn: 0 });

  const result = await ctx.readKinds();

  expect(result).toStrictEqual(before);
});

test('it reuses the task of a definition that comes back in force', async () => {
  const ctx = await setupTest();

  await ctx.writeTasks([{ definitionID: 'water-the-tomatoes', definitionHash: 'hash-1' }]);

  const [first] = await ctx.readTasks();

  invariant(first, 'the seed bound a task');

  await ctx.writeTasks([]);

  const written = await ctx.writeTasks([
    { definitionID: 'water-the-tomatoes', definitionHash: 'hash-1' },
  ]);

  expect(written).toStrictEqual({ created: 0, set: 1, withdrawn: 0 });

  const result = await ctx.readTasks();

  expect(result).toStrictEqual([first]);
});

test('it fails the transaction when a second task takes the definition of the first', async () => {
  const ctx = await setupTest();

  await ctx.writeTasks([{ definitionID: 'water-the-tomatoes', definitionHash: 'hash-1' }]);

  const second = writeRecords(ctx.context.log, [
    {
      kind: 'task.created',
      definitions: ctx.context.definitions(),
      thread: 'other-task',
      payload: taskCreatedCodec.encode({
        taskID: 'other-task',
        isConversation: false,
        state: 'waiting',
      }),
    },
    {
      kind: 'task.definition_set',
      definitions: ctx.context.definitions(),
      thread: 'other-task',
      payload: taskDefinitionSetCodec.encode({
        taskID: 'other-task',
        definitionID: 'water-the-tomatoes',
        definitionHash: 'hash-1',
      }),
    },
  ]);

  await Promise.allSettled([second]);

  expect(second).rejects.toThrow();

  const result = await ctx.readTasks();

  expect(result).toHaveLength(1);
});
