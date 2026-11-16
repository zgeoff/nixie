import { expect, test } from 'bun:test';
import { withWriteTransaction } from '@heynixie/log';
import { writeStepCommit } from '../step/write-step-commit';
import { writeStepError } from '../step/write-step-error';
import { claimTask } from '../task/projection/claim-task';
import { writeTaskControl } from '../task/write-task-control';
import { seedDefinitionTask } from '../test-utils/seed-definition-task';
import { startTestTasks } from '../test-utils/start-test-tasks';
import { writeTestTriggerFire } from '../test-utils/write-test-trigger-fire';
import { readDefinitionTaskInTransaction } from './read-definition-task-in-transaction';

async function setupTest() {
  const tasks = await startTestTasks();

  return {
    ...tasks,
    readAnswer: (definitionID: string) =>
      withWriteTransaction(tasks.writer, (tx) => readDefinitionTaskInTransaction(tx, definitionID)),
    claim: () => claimTask(tasks.context, { holder: 'runner-a', leaseMs: 60_000 }),
  };
}

test('it answers null for a definition with no task', async () => {
  const ctx = await setupTest();
  const result = await ctx.readAnswer('water-the-tomatoes');

  expect(result).toBeNull();
});

test('it answers take for a waiting task', async () => {
  const ctx = await setupTest();

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
  });

  const result = await ctx.readAnswer('water-the-tomatoes');

  expect(result).toStrictEqual({ taskID, fire: 'take' });
});

test('it answers still_running with one fire unread', async () => {
  const ctx = await setupTest();

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
  });

  await writeTestTriggerFire(ctx.context, taskID, { definitionHash: 'hash-1' });

  const result = await ctx.readAnswer('water-the-tomatoes');

  expect(result).toStrictEqual({
    taskID,
    fire: 'still_running',
  });
});

test('it answers still_running while a task run is active', async () => {
  const ctx = await setupTest();

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
  });

  await writeTestTriggerFire(ctx.context, taskID, { definitionHash: 'hash-1' });

  await ctx.claim();

  const result = await ctx.readAnswer('water-the-tomatoes');

  expect(result).toStrictEqual({
    taskID,
    fire: 'still_running',
  });
});

test('it answers take for an idle task run that waits for nothing', async () => {
  const ctx = await setupTest();

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
    policy: { wakeable: true },
  });

  const fire = await writeTestTriggerFire(ctx.context, taskID, { definitionHash: 'hash-1' });
  const claim = await ctx.claim();

  if (claim === null) {
    throw new Error('the fire is claimable');
  }

  await writeStepCommit(ctx.context, claim, { next: 'wait', records: [], acknowledged: [fire] });

  const result = await ctx.readAnswer('water-the-tomatoes');

  expect(result).toStrictEqual({ taskID, fire: 'take' });
});

test('it answers held for a stopped task', async () => {
  const ctx = await setupTest();

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
  });

  await writeTaskControl(ctx.context, { taskID, control: 'stop' });

  const result = await ctx.readAnswer('water-the-tomatoes');

  expect(result).toStrictEqual({ taskID, fire: 'held' });
});

test('it answers held for a paused task', async () => {
  const ctx = await setupTest();

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
  });

  await writeTaskControl(ctx.context, { taskID, control: 'pause' });

  const result = await ctx.readAnswer('water-the-tomatoes');

  expect(result).toStrictEqual({ taskID, fire: 'held' });
});

test('it answers held for a failed task, and not held after a restart', async () => {
  const ctx = await setupTest();

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
  });

  await writeTestTriggerFire(ctx.context, taskID, { definitionHash: 'hash-1' });

  const claim = await ctx.claim();

  if (claim === null) {
    throw new Error('the fire is claimable');
  }

  await writeStepError(ctx.context, claim, {
    maxStepErrors: 1,
    retryDelayMs: 1000,
    maxRetryDelayMs: 1000,
    error: new Error('the step broke'),
  });

  const failed = await ctx.readAnswer('water-the-tomatoes');

  await writeTaskControl(ctx.context, { taskID, control: 'restart' });

  const restarted = await ctx.readAnswer('water-the-tomatoes');

  expect(failed).toStrictEqual({ taskID, fire: 'held' });
  expect(restarted).not.toMatchObject({ fire: 'held' });
});
