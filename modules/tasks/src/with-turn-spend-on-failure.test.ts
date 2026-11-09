import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { claimTask } from './claim-task';
import { createConversationTask } from './create-conversation-task';
import { startTestTasks } from './test-utils/start-test-tasks';
import { withTurnSpendOnFailure } from './with-turn-spend-on-failure';
import { writeInboxRecords } from './write-inbox-records';
import { writeStepCommit } from './write-step-commit';

async function setupTest() {
  const tasks = await startTestTasks();

  return {
    ...tasks,
    claimConversation: async () => {
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

      invariant(claim, 'the conversation has work to claim');

      return claim;
    },
    readSpends: async () => {
      const spends = await readRecords(tasks.context.log, {
        afterSequence: 0,
        kinds: ['task.failed_turn_spent'],
      });

      return spends.map((entry) => entry.record.payload);
    },
  };
}

test("it records the turn's spend and rethrows the error of a write that fails", async () => {
  const ctx = await setupTest();
  const claim = await ctx.claimConversation();

  const outcome = await withTurnSpendOnFailure(
    ctx.context,
    { taskID: 'conversation', dollars: 0.03 },
    () =>
      writeStepCommit(ctx.context, claim, {
        next: 'wait',
        records: [],
        acknowledged: [2],
        timers: [{ dueAt: Number.NaN }],
      }),
  ).then(
    () => null,
    (error: unknown) => error,
  );

  const spends = await ctx.readSpends();

  expect(outcome).toStrictEqual(new Error("a step's timer is due at NaN, which is no time"));
  expect(spends).toStrictEqual([{ taskID: 'conversation', dollars: 0.03 }]);
});

test('it records no spend for a write that lands', async () => {
  const ctx = await setupTest();
  const claim = await ctx.claimConversation();

  await withTurnSpendOnFailure(ctx.context, { taskID: 'conversation', dollars: 0.03 }, () =>
    writeStepCommit(ctx.context, claim, { next: 'wait', records: [], acknowledged: [2] }),
  );

  const spends = await ctx.readSpends();

  expect(spends).toStrictEqual([]);
});

test("it rethrows the write's error with the failed spend write as its cause", async () => {
  const ctx = await setupTest();
  const claim = await ctx.claimConversation();

  await ctx.writer.stop();

  const outcome = await withTurnSpendOnFailure(
    ctx.context,
    { taskID: 'conversation', dollars: 0.03 },
    () =>
      writeStepCommit(ctx.context, claim, {
        next: 'wait',
        records: [],
        acknowledged: [2],
        timers: [{ dueAt: Number.NaN }],
      }),
  ).then(
    () => null,
    (error: unknown) => error,
  );

  expect(outcome).toBeInstanceOf(Error);
  expect(outcome).toHaveProperty('message', "a step's timer is due at NaN, which is no time");
  expect(outcome).toHaveProperty('cause', expect.any(Error));
});
