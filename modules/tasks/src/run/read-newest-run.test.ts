import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { claimTask } from '../task/projection/claim-task';
import { runTaskStep } from '../task/run-task-step';
import { seedDefinitionTask } from '../test-utils/seed-definition-task';
import { startTestTasks } from '../test-utils/start-test-tasks';
import { writeTestTriggerFire } from '../test-utils/write-test-trigger-fire';
import { readNewestRun } from './read-newest-run';
import { readRunRows } from './read-run-rows';

async function setupTest() {
  const tasks = await startTestTasks();

  let fires = 0;

  const openRun = async (taskID: string) => {
    fires += 1;

    await writeTestTriggerFire(tasks.context, taskID, {
      definitionHash: 'hash-1',
      dedupeKey: `fire-${fires}`,
    });

    const claim = await claimTask(tasks.context, { holder: 'runner-a', leaseMs: 60_000, taskID });

    invariant(claim, 'the fire is ready to claim');

    await runTaskStep(tasks.context, claim, {
      runStep: (input) =>
        Promise.resolve({
          next: 'wait',
          records: [],
          acknowledged: input.inbox.map((record) => record.sequence),
        }),
      leaseMs: 60_000,
      logger: () => {},
      maxStepErrors: 3,
      retryDelayMs: 30_000,
      maxRetryDelayMs: 300_000,
    });
  };

  return {
    ...tasks,
    openRun,
    readRuns: (taskID: string) => readRunRows(tasks.writer.db, taskID),
    enableDefinition: () =>
      seedDefinitionTask(tasks, {
        definitionID: 'water-the-tomatoes',
        definitionHash: 'hash-1',
        policy: { wakeable: true },
      }),
  };
}

test('it gives null for a task with no task run', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.enableDefinition();
  const newest = await readNewestRun(ctx.writer.db, taskID);

  expect(newest).toBeNull();
});

test('it gives the task run that opened last', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.enableDefinition();

  await ctx.openRun(taskID);
  await ctx.openRun(taskID);

  const [, second] = await ctx.readRuns(taskID);
  const newest = await readNewestRun(ctx.writer.db, taskID);

  expect(newest).toStrictEqual(second ?? null);
});
