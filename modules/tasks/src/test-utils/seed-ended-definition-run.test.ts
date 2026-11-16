import { expect, test } from 'bun:test';
import { readEndedRuns } from '../run/read-ended-runs';
import { seedDefinitionTask } from './seed-definition-task';
import { seedEndedDefinitionRun } from './seed-ended-definition-run';
import { startTestTasks } from './start-test-tasks';

async function setupTest() {
  const tasks = await startTestTasks();

  const taskID = await seedDefinitionTask(tasks, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
  });

  return { ...tasks, taskID };
}

test('#seedEndedDefinitionRun ends a task run that pins the version of the fire', async () => {
  const ctx = await setupTest();

  await seedEndedDefinitionRun(ctx.context, {
    taskID: ctx.taskID,
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
  });

  const ended = await readEndedRuns(ctx.context, { taskID: ctx.taskID, limit: 10 });

  expect(ended.map((run) => run.opened.definitionHash)).toStrictEqual(['hash-1']);
});

test('#seedEndedDefinitionRun ends a second task run after the first', async () => {
  const ctx = await setupTest();

  const seed = {
    taskID: ctx.taskID,
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
  };

  await seedEndedDefinitionRun(ctx.context, seed);
  await seedEndedDefinitionRun(ctx.context, seed);

  const ended = await readEndedRuns(ctx.context, { taskID: ctx.taskID, limit: 10 });

  expect(ended).toHaveLength(2);
});
