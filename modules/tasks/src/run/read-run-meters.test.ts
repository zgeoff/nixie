import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { buildTaskRunnerRegistry } from '../runner/build-task-runner-registry';
import { conversationRunner } from '../runner/conversation-runner';
import { sandboxRunner } from '../runner/sandbox-runner';
import type { TaskRunnerDefinition } from '../runner/types';
import { writeStepCommit } from '../step/write-step-commit';
import { createTask } from '../task/create-task';
import { claimTask } from '../task/projection/claim-task';
import { buildTaskSeeder } from '../test-utils/build-task-seeder';
import { buildTestRunSettings } from '../test-utils/build-test-run-settings';
import { seedConversationStep } from '../test-utils/seed-conversation-step';
import { startTestTasks } from '../test-utils/start-test-tasks';
import type { TasksContext } from '../types';
import { readRunMeters } from './read-run-meters';
import type { RunMeterName } from './types';

async function setupTest() {
  const tasks = await startTestTasks();
  const starter = await seedConversationStep(tasks.context);

  return {
    ...tasks,
    starter,
    seed: buildTaskSeeder(tasks),
    buildMeteredContext: (meters: TaskRunnerDefinition['meters']): TasksContext => {
      const runner = { ...sandboxRunner, meters };

      return {
        ...tasks.context,
        runSettings: buildTestRunSettings({ used: { turns: 3, dollars: 1.5 } }),
        runners: buildTaskRunnerRegistry({
          definitions: [conversationRunner, runner],
          defaultRunner: runner,
        }),
      };
    },
    readMeterNames: async (context: TasksContext, taskID: string) => {
      const meters = await readRunMeters(context, taskID);

      return meters.map((meter) => meter.name);
    },
    readRunEndedUse: async () => {
      const entries = await readRecords(tasks.context.log, {
        afterSequence: 0,
        kinds: ['task.run_ended'],
      });

      return entries.map((entry) => entry.record.payload['used']);
    },
    readLimitReachedUse: async () => {
      const entries = await readRecords(tasks.context.log, {
        afterSequence: 0,
        kinds: ['task.limit_reached'],
      });

      return entries.map((entry) => entry.record.payload['used']);
    },
  };
}

test.each<[RunMeterName[], RunMeterName[]]>([
  [[], []],
  [['turns'], ['turns']],
  [
    ['turns', 'dollars'],
    ['turns', 'dollars'],
  ],
])('it reads the meters of a task whose runner lists %p as %p', async (listed, names) => {
  const ctx = await setupTest();

  const taskID = await ctx.seed.task({
    starter: ctx.starter.claim,
    name: 'Garden planner',
    brief: 'Add a frost warning to the planner.',
  });

  const meterNames = await ctx.readMeterNames(ctx.buildMeteredContext(listed), taskID);

  expect(meterNames).toStrictEqual(names);
});

test('it reads every meter for a task that no runner runs', async () => {
  const ctx = await setupTest();
  const taskID = await createTask(ctx.context, 'tidy the inbox');
  const meterNames = await ctx.readMeterNames(ctx.buildMeteredContext([]), taskID);

  expect(meterNames).toStrictEqual(['turns', 'dollars']);
});

test('#writeStepCommit ends the task run of a runner with no meters with no use counted', async () => {
  const ctx = await setupTest();

  const context = ctx.buildMeteredContext([]);

  const taskID = await ctx.seed.task({
    starter: ctx.starter.claim,
    name: 'Garden planner',
    brief: 'Add a frost warning to the planner.',
  });

  const claim = await claimTask(context, { holder: 'runner-a', leaseMs: 60_000, taskID });

  invariant(claim, 'the started task is ready to claim');

  await writeStepCommit(context, claim, {
    next: 'done',
    records: [],
    acknowledged: [],
    run: { activity: 'worked', report: { summary: 'The planner warns of frost.' } },
  });

  const used = await ctx.readRunEndedUse();

  expect(used).toStrictEqual([{ turns: 0, dollars: 0, calls: {} }]);
});

test('#writeStepCommit ends the task run of a runner with the use of the meters it lists', async () => {
  const ctx = await setupTest();

  const context = ctx.buildMeteredContext(['turns']);

  const taskID = await ctx.seed.task({
    starter: ctx.starter.claim,
    name: 'Garden planner',
    brief: 'Add a frost warning to the planner.',
  });

  const claim = await claimTask(context, { holder: 'runner-a', leaseMs: 60_000, taskID });

  invariant(claim, 'the started task is ready to claim');

  await writeStepCommit(context, claim, {
    next: 'done',
    records: [],
    acknowledged: [],
    run: { activity: 'worked', report: { summary: 'The planner warns of frost.' } },
  });

  const used = await ctx.readRunEndedUse();

  expect(used).toStrictEqual([{ turns: 3, dollars: 0, calls: {} }]);
});

test('#writeStepCommit holds a task at its limit with the use of the meters its runner lists', async () => {
  const ctx = await setupTest();

  const context = ctx.buildMeteredContext(['turns']);

  const taskID = await ctx.seed.task({
    starter: ctx.starter.claim,
    name: 'Garden planner',
    brief: 'Add a frost warning to the planner.',
  });

  const claim = await claimTask(context, { holder: 'runner-a', leaseMs: 60_000, taskID });

  invariant(claim, 'the started task is ready to claim');

  await writeStepCommit(context, claim, {
    next: 'continue',
    records: [],
    acknowledged: [],
    run: { activity: 'worked', limit: { meter: 'turns', used: 3, limit: 3 } },
  });

  const used = await ctx.readLimitReachedUse();

  expect(used).toStrictEqual([{ turns: 3, dollars: 0 }]);
});
