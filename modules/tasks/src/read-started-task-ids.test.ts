import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { claimTask } from './claim-task';
import { readStartedTaskIDs } from './read-started-task-ids';
import { seedStartedTask } from './test-utils/seed-started-task';
import { startTestTasks } from './test-utils/start-test-tasks';
import { writeStepCommit } from './write-step-commit';
import { writeTaskControl } from './write-task-control';

async function setupTest() {
  const tasks = await startTestTasks();

  return {
    ...tasks,
    seedStartedTask: (name: string) =>
      seedStartedTask(tasks.context, { name, brief: `Work on ${name}.` }),
    commitDone: async () => {
      const claim = await claimTask(tasks.context, {
        holder: 'runner-a',
        leaseMs: 60_000,
        tasks: 'started',
      });

      invariant(claim, 'a started task is ready');

      await writeStepCommit(tasks.context, claim, { next: 'done', records: [], acknowledged: [] });
    },
  };
}

test('it reads the started tasks that are done or closed as ended, and the rest as open', async () => {
  const ctx = await setupTest();
  const done = await ctx.seedStartedTask('Tide tables');

  await ctx.commitDone();

  const closed = await ctx.seedStartedTask('Moon phases');

  await writeTaskControl(ctx.context, { taskID: closed, control: 'close' });

  const stopped = await ctx.seedStartedTask('Star charts');

  await writeTaskControl(ctx.context, { taskID: stopped, control: 'stop' });

  const ready = await ctx.seedStartedTask('Sun times');
  const ended = await readStartedTaskIDs(ctx.context, { end: 'ended' });
  const open = await readStartedTaskIDs(ctx.context, { end: 'open' });

  expect(ended).toStrictEqual([done, closed]);
  expect(open).toStrictEqual([stopped, ready]);
});

test('it reads only the tasks among the IDs it gets', async () => {
  const ctx = await setupTest();

  await ctx.seedStartedTask('Tide tables');

  const second = await ctx.seedStartedTask('Moon phases');

  const open = await readStartedTaskIDs(ctx.context, {
    end: 'open',
    among: [second, 'conversation'],
  });

  expect(open).toStrictEqual([second]);
});

test('it reads no task among no IDs', async () => {
  const ctx = await setupTest();

  await ctx.seedStartedTask('Tide tables');

  const open = await readStartedTaskIDs(ctx.context, { end: 'open', among: [] });

  expect(open).toStrictEqual([]);
});
