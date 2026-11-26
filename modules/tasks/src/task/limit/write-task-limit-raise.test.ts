import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { readEndedRuns } from '../../run/read-ended-runs';
import { writeMeterRead } from '../../run/write-meter-read';
import { buildTestRunSettings } from '../../test-utils/build-test-run-settings';
import { seedConversationStep } from '../../test-utils/seed-conversation-step';
import { seedPausedTask } from '../../test-utils/seed-paused-task';
import { seedTask } from '../../test-utils/seed-task';
import { startTestTasks } from '../../test-utils/start-test-tasks';
import { readTaskSetup } from '../read-task-setup';
import { writeTaskControl } from '../write-task-control';
import { writeTaskLimitRaise } from './write-task-limit-raise';

function setupTest() {
  return startTestTasks();
}

test('it resumes a task that its limit paused, under the raised limit', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const taskID = await seedPausedTask(ctx.context, {
    starter: starter.claim,
    limits: { turns: 3, dollars: 1 },
  });

  const raised = await writeTaskLimitRaise(ctx.context, { taskID, limits: { turns: 10 } });

  expect(raised).toStrictEqual({
    status: 'raised',
    state: 'ready',
    isPauseRequested: false,
    limits: { turns: 10, dollars: 1 },
    sandboxLimit: null,
  });

  const setup = await readTaskSetup(ctx.context, taskID);

  invariant(setup?.kind === 'started');

  expect(setup.limits).toStrictEqual({ turns: 10, dollars: 1 });
});

test('it lets a plain resume through once the limit is raised and the task paused again', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const taskID = await seedPausedTask(ctx.context, {
    starter: starter.claim,
    limits: { turns: 3, dollars: 1 },
  });

  await writeTaskLimitRaise(ctx.context, { taskID, limits: { dollars: 4 } });
  await writeTaskControl(ctx.context, { taskID, control: 'pause' });

  const resumed = await writeTaskControl(ctx.context, { taskID, control: 'resume' });

  expect(resumed).toStrictEqual({
    status: 'controlled',
    state: 'ready',
    isPauseRequested: false,
    sequence: expect.toBeNumber(),
  });
});

test('it raises the limit of a held task that the user stopped, and leaves the task stopped', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const taskID = await seedPausedTask(ctx.context, {
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
    sandboxLimit: null,
  });
});

test('it restarts a stopped task once its limit is raised', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const taskID = await seedPausedTask(ctx.context, {
    starter: starter.claim,
    limits: { turns: 3, dollars: 1 },
  });

  await writeTaskControl(ctx.context, { taskID, control: 'stop' });
  await writeTaskLimitRaise(ctx.context, { taskID, limits: { turns: 10 } });

  const restarted = await writeTaskControl(ctx.context, { taskID, control: 'restart' });

  expect(restarted).toStrictEqual({
    status: 'controlled',
    state: 'ready',
    isPauseRequested: false,
    sequence: expect.toBeNumber(),
  });
});

test('it refuses a raise of a task that its limit does not hold', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const taskID = await seedTask(ctx.context, {
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

  const taskID = await seedPausedTask(ctx.context, {
    starter: starter.claim,
    limits: { turns: 3, dollars: 1 },
  });

  const raised = await writeTaskLimitRaise(ctx.context, { taskID, limits });
  const resumed = await writeTaskControl(ctx.context, { taskID, control: 'resume' });

  expect(raised).toStrictEqual({ status: 'refused', reason: 'not_raised' });

  expect(resumed).toStrictEqual({
    status: 'refused',
    refusal: { reason: 'at_limit', state: 'paused', isPauseRequested: false },
  });
});

test('it refuses a raise of an unknown task', async () => {
  const ctx = await setupTest();

  const raised = await writeTaskLimitRaise(ctx.context, {
    taskID: 'k3vq8m2xpa',
    limits: { turns: 10 },
  });

  expect(raised).toStrictEqual({ status: 'refused', reason: 'unknown_task' });
});

test('it names the sandbox that the gateway counts, with its last count and what the raise leaves to spend', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const metered = { ...ctx.context, runSettings: buildTestRunSettings({ meter: 'gateway' }) };

  const taskID = await seedPausedTask(metered, {
    starter: starter.claim,
    limits: { turns: 3, dollars: 1 },
  });

  const [run] = await readEndedRuns(metered, { taskID, limit: 1 });

  invariant(run);

  await writeMeterRead(metered, {
    taskID,
    taskRunID: run.runID,
    sandbox: 'sandbox-1',
    reason: 'run_start',
    countMicros: 200_000,
  });

  await writeMeterRead(metered, {
    taskID,
    taskRunID: run.runID,
    sandbox: 'sandbox-1',
    reason: 'step_end',
    countMicros: 730_000,
  });

  const raised = await writeTaskLimitRaise(metered, { taskID, limits: { dollars: 4 } });

  expect(raised).toMatchObject({
    status: 'raised',
    sandboxLimit: { sandbox: 'sandbox-1', countMicros: 730_000, leftDollars: 4 },
  });
});

test('it names no sandbox for a task run that no gateway counts', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const taskID = await seedPausedTask(ctx.context, {
    starter: starter.claim,
    limits: { turns: 3, dollars: 1 },
  });

  const raised = await writeTaskLimitRaise(ctx.context, { taskID, limits: { dollars: 4 } });

  expect(raised).toMatchObject({ status: 'raised', sandboxLimit: null });
});
