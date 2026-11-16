import { expect, test } from 'bun:test';
import { claimTask, readOpenRun, writeStepCommit, writeTaskLimitRaise } from '@heynixie/tasks';
import { seedDefinitionTask, writeTestTriggerFire } from '@heynixie/tasks/test-utils';
import invariant from 'tiny-invariant';
import { startTestTasks } from '../test-utils/start-test-tasks';
import { readRunTrigger } from './read-run-trigger';

async function setupTest() {
  const tasks = await startTestTasks();

  return {
    ...tasks,
    readRun: (taskID: string) => readOpenRun(tasks.writer.db, taskID),
    readTrigger: (run: Parameters<typeof readRunTrigger>[1]) =>
      readRunTrigger({ context: tasks.context, defaultZone: 'Australia/Sydney' }, run),
  };
}

test('it reads the times of the first fire for a task run that carries on after a raised limit', async () => {
  const ctx = await setupTest();

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
    version: {
      trigger: {
        schedule: { every: 'day', at: '06:30', zone: 'Pacific/Auckland', catchUp: 'once' },
      },
    },
  });

  const sequence = await writeTestTriggerFire(ctx.context, taskID, {
    definitionHash: 'hash-1',
    scheduledFor: '2026-06-03T18:30:00.000Z',
    firedAt: '2026-06-03T18:30:00.000Z',
  });

  const claim = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000, taskID });

  invariant(claim, 'the fire task is claimed');

  await writeStepCommit(ctx.context, claim, {
    next: 'continue',
    records: [],
    acknowledged: [sequence],
    run: { activity: 'worked', limit: { meter: 'turns', used: 1, limit: 1 } },
  });

  await writeTaskLimitRaise(ctx.context, { taskID, limits: { turns: 10_000 } });
  await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000, taskID });

  const carried = await ctx.readRun(taskID);

  invariant(carried, 'a carried task run is open');

  const trigger = await ctx.readTrigger(carried);

  expect(trigger?.zone).toBe('Pacific/Auckland');
  expect(trigger?.details.scheduledFor).toBe('2026-06-04T06:30:00+12:00');
  expect(trigger?.details.sentence).toStartWith('This task run was scheduled for Thu 4 Jun, 06:30');
});
