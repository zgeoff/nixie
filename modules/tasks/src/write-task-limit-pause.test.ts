import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { claimTask } from './claim-task';
import { LeaseLostError } from './lease-lost-error';
import { seedConversationStep } from './test-utils/seed-conversation-step';
import { seedStartedTask } from './test-utils/seed-started-task';
import { startTestTasks } from './test-utils/start-test-tasks';
import type { TasksTables } from './types';
import { writeStepCommit } from './write-step-commit';
import { writeTaskControl } from './write-task-control';
import { writeTaskLimitPause } from './write-task-limit-pause';
import { writeTaskLimitRaise } from './write-task-limit-raise';

async function setupTest() {
  const tasks = await startTestTasks();

  const db = tasks.writer.db.$extendTables<TasksTables>();

  return {
    ...tasks,
    readTask: (taskID: string) =>
      db
        .selectFrom('tasks')
        .select(['state', 'pause_requested', 'last_inbox_sequence'])
        .where('task_id', '=', taskID)
        .executeTakeFirstOrThrow(),
    claimStartedTask: async (taskID: string) => {
      const claim = await claimTask(tasks.context, { holder: 'runner-a', leaseMs: 60_000, taskID });

      invariant(claim, 'the started task is ready to claim');

      return claim;
    },
  };
}

test('it pauses a task at its limit once its step commits, and a plain resume leaves it paused', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const taskID = await seedStartedTask(ctx.context, {
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  const claim = await ctx.claimStartedTask(taskID);

  await writeTaskLimitPause(ctx.context, {
    lease: claim.lease,
    stepKey: claim.stepKey,
    startedBy: 'conversation',
    used: { turns: 25, dollars: 0.4 },
    limits: { turns: 25, dollars: 2 },
    isWorkCut: false,
  });

  await writeStepCommit(ctx.context, claim, { next: 'wait', records: [], acknowledged: [] });

  const resumed = await writeTaskControl(ctx.context, { taskID, control: 'resume' });

  expect(resumed).toStrictEqual({
    status: 'refused',
    refusal: { reason: 'at_limit', state: 'paused', isPauseRequested: false },
  });

  const task = await ctx.readTask(taskID);

  expect(task.state).toBe('paused');
});

test('it leaves a task whose turn the limit cut ready to run once a raise resumes it', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const taskID = await seedStartedTask(ctx.context, {
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  const claim = await ctx.claimStartedTask(taskID);

  await writeTaskLimitPause(ctx.context, {
    lease: claim.lease,
    stepKey: claim.stepKey,
    startedBy: 'conversation',
    used: { turns: 2, dollars: 2.1 },
    limits: { turns: 25, dollars: 2 },
    isWorkCut: true,
  });

  await writeStepCommit(ctx.context, claim, { next: 'wait', records: [], acknowledged: [] });
  await writeTaskLimitRaise(ctx.context, { taskID, limits: { dollars: 4 } });

  const task = await ctx.readTask(taskID);

  expect(task.state).toBe('ready');
});

test("it writes a limit notice into the starter's inbox that names the task and its counts", async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const taskID = await seedStartedTask(ctx.context, {
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  const claim = await ctx.claimStartedTask(taskID);

  await writeTaskLimitPause(ctx.context, {
    lease: claim.lease,
    stepKey: claim.stepKey,
    startedBy: 'conversation',
    used: { turns: 4, dollars: 2.1 },
    limits: { turns: 25, dollars: 2 },
    isWorkCut: false,
  });

  const notices = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['task.limit_notice'],
  });

  const conversation = await ctx.readTask('conversation');

  expect(
    notices.map((entry) => ({ thread: entry.record.thread, payload: entry.record.payload })),
  ).toStrictEqual([
    {
      thread: 'conversation',
      payload: {
        taskID,
        used: { turns: 4, dollars: 2.1 },
        limits: { turns: 25, dollars: 2 },
      },
    },
  ]);

  expect(conversation.last_inbox_sequence).toBe(notices[0]?.record.sequence ?? -1);
});

test('it writes no notice to a starter that has finished, and still holds the task', async () => {
  const ctx = await setupTest();
  const conversation = await seedConversationStep(ctx.context);

  const parent = await seedStartedTask(ctx.context, {
    starter: conversation.claim,
    name: 'Garden plan',
    brief: 'Plan the beds.',
  });

  const parentClaim = await ctx.claimStartedTask(parent);

  const taskID = await seedStartedTask(ctx.context, {
    starter: parentClaim,
    name: 'Seed list',
    brief: 'List the seeds.',
  });

  await writeStepCommit(ctx.context, parentClaim, { next: 'wait', records: [], acknowledged: [] });
  await writeTaskControl(ctx.context, { taskID: parent, control: 'close' });

  const claim = await ctx.claimStartedTask(taskID);

  await writeTaskLimitPause(ctx.context, {
    lease: claim.lease,
    stepKey: claim.stepKey,
    startedBy: parent,
    used: { turns: 25, dollars: 1 },
    limits: { turns: 25, dollars: 2 },
    isWorkCut: false,
  });

  const notices = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['task.limit_notice'],
  });

  const task = await ctx.readTask(taskID);

  expect(notices).toStrictEqual([]);
  expect(task.pause_requested).toBe(1);
});

test('it refuses a step that lost its lease, and writes nothing', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const taskID = await seedStartedTask(ctx.context, {
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  const claim = await ctx.claimStartedTask(taskID);

  await writeTaskControl(ctx.context, { taskID, control: 'stop' });

  const written = writeTaskLimitPause(ctx.context, {
    lease: claim.lease,
    stepKey: claim.stepKey,
    startedBy: 'conversation',
    used: { turns: 25, dollars: 1 },
    limits: { turns: 25, dollars: 2 },
    isWorkCut: false,
  });

  await written.catch(() => {});

  expect(written).rejects.toThrowWithMessage(
    LeaseLostError,
    `lease lost on task ${taskID} at generation ${String(claim.lease.generation)}`,
  );

  const held = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['task.limit_reached', 'task.limit_notice'],
  });

  expect(held).toStrictEqual([]);
});
