import { expect, test } from 'bun:test';
import { readRecords, withWriteTransaction } from '@heynixie/log';
import { seedDefinitionTask } from '../test-utils/seed-definition-task';
import { startTestTasks } from '../test-utils/start-test-tasks';
import type { TasksTables } from '../types';
import { withdrawDefinitionTaskInTransaction } from './withdraw-definition-task-in-transaction';

async function setupTest() {
  const tasks = await startTestTasks();

  return {
    ...tasks,
    withdraw: (definitionID: string) =>
      withWriteTransaction(tasks.writer, (tx) =>
        withdrawDefinitionTaskInTransaction(tx, tasks.context, definitionID),
      ),
    readHash: async (definitionID: string) => {
      const row = await tasks.writer.db
        .$extendTables<TasksTables>()
        .selectFrom('tasks')
        .select('definition_hash')
        .where('definition_id', '=', definitionID)
        .executeTakeFirstOrThrow();

      return row.definition_hash;
    },
    readRecordCount: async () => {
      const entries = await readRecords(tasks.context.log, { afterSequence: 0 });

      return entries.length;
    },
  };
}

test('it writes a null hash for a bound task that holds a hash', async () => {
  const ctx = await setupTest();

  await seedDefinitionTask(ctx, { definitionID: 'water-the-tomatoes', definitionHash: 'hash-1' });

  await ctx.withdraw('water-the-tomatoes');

  const result = await ctx.readHash('water-the-tomatoes');

  expect(result).toBeNull();
});

test('it writes nothing for a bound task that holds no hash', async () => {
  const ctx = await setupTest();

  await seedDefinitionTask(ctx, { definitionID: 'water-the-tomatoes', definitionHash: null });

  const before = await ctx.readRecordCount();

  await ctx.withdraw('water-the-tomatoes');

  const result = await ctx.readRecordCount();

  expect(result).toBe(before);
});

test('it writes nothing for a definition that has no task', async () => {
  const ctx = await setupTest();

  await ctx.withdraw('water-the-tomatoes');

  const result = await ctx.readRecordCount();

  expect(result).toBe(0);
});
