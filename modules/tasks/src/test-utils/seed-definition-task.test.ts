import { expect, test } from 'bun:test';
import type { TasksTables } from '../types';
import { seedDefinitionTask } from './seed-definition-task';
import { startTestTasks } from './start-test-tasks';

async function setupTest() {
  const tasks = await startTestTasks();

  return {
    ...tasks,
    readBindings: () =>
      tasks.writer.db
        .$extendTables<TasksTables>()
        .selectFrom('tasks')
        .select(['task_id', 'definition_id', 'definition_hash'])
        .orderBy('created_sequence')
        .execute(),
  };
}

test('it binds a task to the definition at the hash and returns its ID', async () => {
  const ctx = await setupTest();

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
  });

  const bindings = await ctx.readBindings();

  expect(bindings).toStrictEqual([
    { task_id: taskID, definition_id: 'water-the-tomatoes', definition_hash: 'hash-1' },
  ]);
});

test('it leaves a null hash on a task whose definition left force', async () => {
  const ctx = await setupTest();

  await seedDefinitionTask(ctx, { definitionID: 'water-the-tomatoes', definitionHash: null });

  const bindings = await ctx.readBindings();

  expect(bindings).toMatchObject([{ definition_hash: null }]);
});

test('it keeps the other definitions in force', async () => {
  const ctx = await setupTest();

  await seedDefinitionTask(ctx, { definitionID: 'water-the-tomatoes', definitionHash: 'hash-1' });
  await seedDefinitionTask(ctx, { definitionID: 'mow-the-lawn', definitionHash: 'hash-2' });

  const bindings = await ctx.readBindings();

  expect(bindings.map((binding) => binding.definition_hash)).toStrictEqual(['hash-1', 'hash-2']);
});

test('it stores the version and the policy of the hash for the context readers', async () => {
  const ctx = await setupTest();

  await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
    version: { name: 'Water them' },
    policy: { wakeable: true },
  });

  const version = await ctx.context.readDefinitionVersion(ctx.writer.db, 'hash-1');
  const policy = await ctx.context.readDefinitionRunPolicy(ctx.writer.db, 'task', 'hash-1');

  expect(version).toMatchObject({ definitionID: 'water-the-tomatoes', name: 'Water them' });
  expect(policy).toMatchObject({ wakeable: true });
});
