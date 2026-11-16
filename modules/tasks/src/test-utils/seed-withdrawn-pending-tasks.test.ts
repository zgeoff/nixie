import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { readRunState } from '../run/read-run-state';
import type { TasksTables } from '../types';
import { seedDefinitionTask } from './seed-definition-task';
import { seedWithdrawnPendingTasks } from './seed-withdrawn-pending-tasks';
import { startTestTasks } from './start-test-tasks';

async function setupTest() {
  const tasks = await startTestTasks();

  return {
    ...tasks,
    readRunState: (taskID: string) => readRunState(tasks.context, taskID),
    readBindings: () =>
      tasks.writer.db
        .$extendTables<TasksTables>()
        .selectFrom('tasks')
        .select(['task_id', 'definition_id', 'definition_hash'])
        .orderBy('created_sequence')
        .execute(),
  };
}

test('it leaves a pending task run on each task', async () => {
  const ctx = await setupTest();

  const taskIDs = await seedWithdrawnPendingTasks(ctx.context, [
    { definitionID: 'prune-the-roses', definitionHash: 'hash-1' },
    { definitionID: 'feed-the-fish', definitionHash: 'hash-2' },
  ]);

  const states = await Promise.all(taskIDs.map((taskID) => ctx.readRunState(taskID)));

  expect(states).toStrictEqual([{ kind: 'pending' }, { kind: 'pending' }]);
});

test('it withdraws its own definitions and keeps the definitions already in force bound', async () => {
  const ctx = await setupTest();

  const kept = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
  });

  const [pruned] = await seedWithdrawnPendingTasks(ctx.context, [
    { definitionID: 'prune-the-roses', definitionHash: 'hash-2' },
  ]);

  invariant(typeof pruned === 'string');

  const bindings = await ctx.readBindings();

  expect(bindings).toStrictEqual([
    { task_id: kept, definition_id: 'water-the-tomatoes', definition_hash: 'hash-1' },
    { task_id: pruned, definition_id: 'prune-the-roses', definition_hash: null },
  ]);
});
