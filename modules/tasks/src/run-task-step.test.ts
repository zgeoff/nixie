import { expect, test } from 'bun:test';
import { waitForCondition } from '@heynixie/testing';
import { claimTask } from './claim-task';
import { createConversationTask } from './create-conversation-task';
import { runTaskStep } from './run-task-step';
import { startTestTasks } from './test-utils/start-test-tasks';
import type { StepInput, StepResult, TasksTables } from './types';
import { writeInboxRecords } from './write-inbox-records';

// the conversation with one message from you, claimed by a runner
async function setupTest() {
  const tasks = await startTestTasks();
  const db = tasks.writer.db.$extendTables<TasksTables>();

  await createConversationTask(tasks.context);
  await writeInboxRecords(tasks.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'what is on today?' },
    },
  ]);

  const claim = await claimTask(tasks.context, { holder: 'runner-a', leaseMs: 60_000 });

  if (claim === null) {
    throw new Error('the setup claim found no task');
  }
  const readTask = () => db.selectFrom('tasks').selectAll().executeTakeFirstOrThrow();

  return { ...tasks, db, claim, readTask };
}

test('it gives the step its unread inbox and commits what the step returns', async () => {
  const ctx = await setupTest();
  const inputs: StepInput[] = [];

  await runTaskStep(ctx.context, ctx.claim, {
    runStep: (input) => {
      inputs.push(input);
      return Promise.resolve<StepResult>({ next: 'wait', records: [], acknowledged: [2] });
    },
    leaseMs: 60_000,
    maxStepErrors: 3,
    retryDelayMs: 30_000,
  });

  const task = await ctx.readTask();

  expect(inputs).toMatchObject([
    {
      taskID: 'conversation',
      stepKey: 'conversation:1',
      inbox: [{ sequence: 2, erasable: { fields: { text: 'what is on today?' } } }],
    },
  ]);
  expect(task).toMatchObject({ state: 'waiting', read_cursor: 2 });
});

test('it records the error when the step throws', async () => {
  const ctx = await setupTest();

  await runTaskStep(ctx.context, ctx.claim, {
    runStep: () => Promise.reject(new Error('the model profile is unreachable')),
    leaseMs: 60_000,
    maxStepErrors: 3,
    retryDelayMs: 30_000,
  });

  const task = await ctx.readTask();

  expect(task).toMatchObject({ state: 'ready', step_errors: 1, read_cursor: 0 });
});

test('it aborts the step and commits nothing once the lease is lost', async () => {
  const ctx = await setupTest();
  const seen = { aborted: false };

  await runTaskStep(ctx.context, ctx.claim, {
    runStep: async (input) => {
      await waitForCondition(() => ctx.clock.countSleepers() === 1);

      // the runner stalled past every renewal, so the next one finds the lease expired
      ctx.clock.advance(60_000);
      await waitForCondition(() => input.signal.aborted);
      seen.aborted = input.signal.aborted;
      return { next: 'done', records: [], acknowledged: [2] };
    },
    leaseMs: 60_000,
    maxStepErrors: 3,
    retryDelayMs: 30_000,
  });

  const task = await ctx.readTask();

  expect(seen.aborted).toBeTrue();
  expect(task).toMatchObject({ state: 'running', committed_steps: 0 });
});
