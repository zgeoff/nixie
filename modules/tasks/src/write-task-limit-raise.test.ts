import { expect, test } from 'bun:test';
import { readTaskSetup } from './read-task-setup';
import { seedConversationStep } from './test-utils/seed-conversation-step';
import { seedHeldTask } from './test-utils/seed-held-task';
import { seedStartedTask } from './test-utils/seed-started-task';
import { startTestTasks } from './test-utils/start-test-tasks';
import { writeTaskControl } from './write-task-control';
import { writeTaskLimitRaise } from './write-task-limit-raise';

function setupTest() {
  return startTestTasks();
}

test('it resumes a task that its limit paused, under the raised limit', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const taskID = await seedHeldTask(ctx.context, {
    starter: starter.claim,
    limits: { turns: 3, dollars: 1 },
  });

  const raised = await writeTaskLimitRaise(ctx.context, { taskID, limits: { turns: 10 } });

  expect(raised).toStrictEqual({
    status: 'raised',
    state: 'ready',
    isPauseRequested: false,
    limits: { turns: 10, dollars: 1 },
  });

  const setup = await readTaskSetup(ctx.context, taskID);

  expect(setup?.limits).toStrictEqual({ turns: 10, dollars: 1 });
});

test('it lets a plain resume through once the limit is raised and the task paused again', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const taskID = await seedHeldTask(ctx.context, {
    starter: starter.claim,
    limits: { turns: 3, dollars: 1 },
  });

  await writeTaskLimitRaise(ctx.context, { taskID, limits: { dollars: 4 } });
  await writeTaskControl(ctx.context, { taskID, control: 'pause' });

  const resumed = await writeTaskControl(ctx.context, { taskID, control: 'resume' });

  expect(resumed).toMatchObject({ status: 'controlled', state: 'ready' });
});

test('it raises the limit of a held task that the user stopped, and leaves the task stopped', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const taskID = await seedHeldTask(ctx.context, {
    starter: starter.claim,
    limits: { turns: 3, dollars: 1 },
  });

  await writeTaskControl(ctx.context, { taskID, control: 'stop' });

  const raised = await writeTaskLimitRaise(ctx.context, { taskID, limits: { turns: 10 } });

  expect(raised).toStrictEqual({
    status: 'raised',
    state: 'stopped',
    isPauseRequested: false,
    limits: { turns: 10, dollars: 1 },
  });
});

test('it restarts a stopped task once its limit is raised', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const taskID = await seedHeldTask(ctx.context, {
    starter: starter.claim,
    limits: { turns: 3, dollars: 1 },
  });

  await writeTaskControl(ctx.context, { taskID, control: 'stop' });
  await writeTaskLimitRaise(ctx.context, { taskID, limits: { turns: 10 } });

  const restarted = await writeTaskControl(ctx.context, { taskID, control: 'restart' });

  expect(restarted).toMatchObject({ status: 'controlled', state: 'ready' });
});

test('it refuses a raise of a task that its limit does not hold', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const taskID = await seedStartedTask(ctx.context, {
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  const raised = await writeTaskLimitRaise(ctx.context, { taskID, limits: { turns: 50 } });

  expect(raised).toStrictEqual({ status: 'refused', reason: 'not_held' });
});

test.each([
  ['the same limits', { turns: 3, dollars: 1 }],
  ['a lower turn limit', { turns: 2, dollars: 5 }],
  ['a lower dollar limit', { dollars: 0.5 }],
])('it refuses a raise to %s, and the task stays held', async (_case, limits) => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const taskID = await seedHeldTask(ctx.context, {
    starter: starter.claim,
    limits: { turns: 3, dollars: 1 },
  });

  const raised = await writeTaskLimitRaise(ctx.context, { taskID, limits });
  const resumed = await writeTaskControl(ctx.context, { taskID, control: 'resume' });

  expect(raised).toStrictEqual({ status: 'refused', reason: 'not_raised' });
  expect(resumed).toMatchObject({ status: 'refused', refusal: { reason: 'at_limit' } });
});

test('it refuses a raise of an unknown task', async () => {
  const ctx = await setupTest();

  const raised = await writeTaskLimitRaise(ctx.context, {
    taskID: 'k3vq8m2xpa',
    limits: { turns: 10 },
  });

  expect(raised).toStrictEqual({ status: 'refused', reason: 'unknown_task' });
});
