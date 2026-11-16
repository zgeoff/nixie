import { expect, test } from 'bun:test';
import { withWriteTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { withdrawDefinitionTaskInTransaction } from '../definition/withdraw-definition-task-in-transaction';
import { readInbox } from '../inbox/read-inbox';
import { writeStepCommit } from '../step/write-step-commit';
import { buildTaskSeeder } from '../test-utils/build-task-seeder';
import { seedDefinitionTask } from '../test-utils/seed-definition-task';
import { startTestTasks } from '../test-utils/start-test-tasks';
import { writeTestTriggerFire } from '../test-utils/write-test-trigger-fire';
import { claimTask } from './projection/claim-task';
import { readStartedTaskIDs } from './read-started-task-ids';
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

test('it reads the task of a definition in force as open', async () => {
  const ctx = await setupTest();

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
  });

  const result2 = await readStartedTaskIDs(ctx.context, { end: 'open' });

  expect(result2).toStrictEqual([taskID]);

  const result = await readStartedTaskIDs(ctx.context, { end: 'ended' });

  expect(result).toStrictEqual([]);
});

test('it reads the task of a definition out of force with nothing pending as ended', async () => {
  const ctx = await setupTest();

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: null,
  });

  const result2 = await readStartedTaskIDs(ctx.context, { end: 'ended' });

  expect(result2).toStrictEqual([taskID]);

  const result = await readStartedTaskIDs(ctx.context, { end: 'open' });

  expect(result).toStrictEqual([]);
});

test('it reads the task of a definition out of force as open while a fire is pending', async () => {
  const ctx = await setupTest();

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: null,
  });

  await writeTestTriggerFire(ctx.context, taskID, {
    definitionHash: 'water-the-tomatoes-spent',
  });

  const result = await readStartedTaskIDs(ctx.context, { end: 'open' });

  expect(result).toStrictEqual([taskID]);
});

test('it reads the task of a definition out of force as open while its task run is open', async () => {
  const ctx = await setupTest();

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
  });

  await writeTestTriggerFire(ctx.context, taskID, { definitionHash: 'hash-1' });
  await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  await withWriteTransaction(ctx.writer, (tx) =>
    withdrawDefinitionTaskInTransaction(tx, ctx.context, 'water-the-tomatoes'),
  );

  const result = await readStartedTaskIDs(ctx.context, { end: 'open' });

  expect(result).toStrictEqual([taskID]);
});
