import { expect, test } from 'bun:test';
import { readOpenRun } from '../run/read-open-run';
import { seedDefinitionTask } from './seed-definition-task';
import { seedOpenDefinitionRun } from './seed-open-definition-run';
import { startTestTasks } from './start-test-tasks';

async function setupTest() {
  const tasks = await startTestTasks();

  const taskID = await seedDefinitionTask(tasks, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
  });

  return { ...tasks, taskID };
}

test('#seedOpenDefinitionRun leaves a task run open on the version of the fire', async () => {
  const ctx = await setupTest();

  await seedOpenDefinitionRun(ctx.context, {
    taskID: ctx.taskID,
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
  });

  const run = await readOpenRun(ctx.writer.db, ctx.taskID);

  expect(run?.opened.definitionHash).toBe('hash-1');
});
