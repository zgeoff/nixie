import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { claimTask } from './claim-task';
import { readInbox } from './read-inbox';
import { readStartedTaskIDs } from './read-started-task-ids';
import { buildTaskSeeder } from './test-utils/build-task-seeder';
import { startTestTasks } from './test-utils/start-test-tasks';
import { writeStepCommit } from './write-step-commit';
import { writeTaskControl } from './write-task-control';

async function setupTest() {
  const tasks = await startTestTasks();

  return {
    ...tasks,
    seed: buildTaskSeeder(tasks),
    commitDone: async () => {
      const claim = await claimTask(tasks.context, {
        holder: 'runner-a',
        leaseMs: 60_000,
        tasks: 'started',
      });

      invariant(claim, 'a started task is ready');

      const inbox = await readInbox(tasks.context, claim.lease.workID);

      await writeStepCommit(tasks.context, claim, {
        next: 'done',
        records: [],
        acknowledged: inbox.map((record) => record.sequence),
      });
    },
  };
}

test('it reads the started tasks that are done or closed as ended, and the rest as open', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  const done = await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Work on Tide tables.',
  });

  await ctx.commitDone();

  const closed = await ctx.seed.task({
    starter: starter.claim,
    name: 'Moon phases',
    brief: 'Work on Moon phases.',
  });

  await writeTaskControl(ctx.context, { taskID: closed, control: 'close' });

  const stopped = await ctx.seed.task({
    starter: starter.claim,
    name: 'Star charts',
    brief: 'Work on Star charts.',
  });

  await writeTaskControl(ctx.context, { taskID: stopped, control: 'stop' });

  const ready = await ctx.seed.task({
    starter: starter.claim,
    name: 'Sun times',
    brief: 'Work on Sun times.',
  });

  const ended = await readStartedTaskIDs(ctx.context, { end: 'ended' });
  const open = await readStartedTaskIDs(ctx.context, { end: 'open' });

  expect(ended).toStrictEqual([done, closed]);
  expect(open).toStrictEqual([stopped, ready]);
});

test('it reads only the tasks among the IDs it gets', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Work on Tide tables.',
  });

  const second = await ctx.seed.task({
    starter: starter.claim,
    name: 'Moon phases',
    brief: 'Work on Moon phases.',
  });

  const open = await readStartedTaskIDs(ctx.context, {
    end: 'open',
    among: [second, 'conversation'],
  });

  expect(open).toStrictEqual([second]);
});

test('it reads no task among no IDs', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Work on Tide tables.',
  });

  const open = await readStartedTaskIDs(ctx.context, { end: 'open', among: [] });

  expect(open).toStrictEqual([]);
});
