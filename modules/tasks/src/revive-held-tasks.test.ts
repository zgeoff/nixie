import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { claimTask } from './claim-task';
import { reviveHeldTasks } from './revive-held-tasks';
import { seedStartedTask } from './test-utils/seed-started-task';
import { startTestTasks } from './test-utils/start-test-tasks';
import type { TasksTables } from './types';
import { writeInboxRecords } from './write-inbox-records';
import { writeStepCommit } from './write-step-commit';
import { writeTaskControl } from './write-task-control';

interface HeldStep {
  readonly next: 'hold' | 'wait';
  readonly sessionBoundary?: string;
}

async function setupTest() {
  const tasks = await startTestTasks();

  const db = tasks.writer.db.$extendTables<TasksTables>();

  const writeMessage = (taskID: string, text: string) =>
    writeInboxRecords(tasks.context, [
      {
        kind: 'owner_message',
        definitions: tasks.context.definitions(),
        thread: taskID,
        erasable: { text },
      },
    ]);

  const commitNextStep = async (step: HeldStep) => {
    const claim = await claimTask(tasks.context, {
      holder: 'runner-a',
      leaseMs: 60_000,
      tasks: 'started',
    });

    invariant(claim, 'a started task is ready');

    await writeStepCommit(tasks.context, claim, { ...step, records: [], acknowledged: [] });
  };

  return {
    ...tasks,
    writeMessage,
    commitNextStep,
    reviveHeldTasks: () => reviveHeldTasks(tasks.context),
    readState: async (taskID: string) => {
      const row = await db
        .selectFrom('tasks')
        .select('state')
        .where('task_id', '=', taskID)
        .executeTakeFirstOrThrow();

      return row.state;
    },
  };
}

test('it makes a held task with unread messages ready', async () => {
  const ctx = await setupTest();
  const taskID = await seedStartedTask(ctx.context, { name: 'Tide tables', brief: 'Find tides.' });

  await ctx.writeMessage(taskID, 'Saturday only, please.');
  await ctx.commitNextStep({ next: 'hold' });
  await ctx.reviveHeldTasks();

  const state = await ctx.readState(taskID);

  expect(state).toBe('ready');
});

test('it lets a claim loop claim a revived task, which then runs', async () => {
  const ctx = await setupTest();
  const taskID = await seedStartedTask(ctx.context, { name: 'Tide tables', brief: 'Find tides.' });

  await ctx.writeMessage(taskID, 'Saturday only, please.');
  await ctx.commitNextStep({ next: 'hold' });
  await ctx.reviveHeldTasks();

  await claimTask(ctx.context, { holder: 'runner-b', leaseMs: 60_000, tasks: 'started' });

  const state = await ctx.readState(taskID);

  expect(state).toBe('running');
});

test('it makes a held task that never opened a session ready, though it has no message', async () => {
  const ctx = await setupTest();
  const taskID = await seedStartedTask(ctx.context, { name: 'Tide tables', brief: 'Find tides.' });

  await ctx.commitNextStep({ next: 'hold' });
  await ctx.reviveHeldTasks();

  const state = await ctx.readState(taskID);

  expect(state).toBe('ready');
});

test('it leaves a started task that waits on its session with every message read', async () => {
  const ctx = await setupTest();
  const taskID = await seedStartedTask(ctx.context, { name: 'Tide tables', brief: 'Find tides.' });

  await ctx.commitNextStep({ next: 'wait', sessionBoundary: '{"sessionID":"s1"}' });
  await ctx.reviveHeldTasks();

  const state = await ctx.readState(taskID);

  expect(state).toBe('waiting');
});

test('it leaves a paused held task paused', async () => {
  const ctx = await setupTest();
  const taskID = await seedStartedTask(ctx.context, { name: 'Tide tables', brief: 'Find tides.' });

  await ctx.writeMessage(taskID, 'Saturday only, please.');
  await ctx.commitNextStep({ next: 'hold' });

  await writeTaskControl(ctx.context, { taskID, control: 'pause' });

  await ctx.reviveHeldTasks();

  const state = await ctx.readState(taskID);

  expect(state).toBe('paused');
});

test('it leaves the waiting conversation alone', async () => {
  const ctx = await setupTest();

  await seedStartedTask(ctx.context, { name: 'Tide tables', brief: 'Find tides.' });

  await ctx.reviveHeldTasks();

  const state = await ctx.readState('conversation');

  expect(state).toBe('waiting');
});

test('it revives nothing on a second run', async () => {
  const ctx = await setupTest();
  const taskID = await seedStartedTask(ctx.context, { name: 'Tide tables', brief: 'Find tides.' });

  await ctx.writeMessage(taskID, 'Saturday only, please.');
  await ctx.commitNextStep({ next: 'hold' });
  await ctx.reviveHeldTasks();

  const revived = await ctx.reviveHeldTasks();

  expect(revived).toBe(0);
});
