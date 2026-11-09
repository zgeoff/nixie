import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import type { LogFields } from '@heynixie/logger';
import { seedConversationStep } from './test-utils/seed-conversation-step';
import { startTestTasks } from './test-utils/start-test-tasks';
import { withTurnSpendOnFailure } from './with-turn-spend-on-failure';
import { writeStepCommit } from './write-step-commit';

async function setupTest() {
  const tasks = await startTestTasks();

  const events: { event: string; fields: LogFields | undefined }[] = [];

  return {
    ...tasks,
    events,
    logger: (event: string, fields?: LogFields) => {
      events.push({ event, fields });
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
  const step = await seedConversationStep(ctx.context);

  const outcome = await withTurnSpendOnFailure(
    ctx.context,
    { spend: { taskID: 'conversation', dollars: 0.03 }, logger: ctx.logger },
    () =>
      writeStepCommit(ctx.context, step.claim, {
        next: 'wait',
        records: [],
        acknowledged: [step.messageSequence],
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
  const step = await seedConversationStep(ctx.context);

  await withTurnSpendOnFailure(
    ctx.context,
    { spend: { taskID: 'conversation', dollars: 0.03 }, logger: ctx.logger },
    () =>
      writeStepCommit(ctx.context, step.claim, {
        next: 'wait',
        records: [],
        acknowledged: [step.messageSequence],
      }),
  );

  const spends = await ctx.readSpends();

  expect(spends).toStrictEqual([]);
});

test("it logs a spend write that fails, and rethrows the write's own error", async () => {
  const ctx = await setupTest();
  const step = await seedConversationStep(ctx.context);

  await ctx.writer.stop();

  const outcome = await withTurnSpendOnFailure(
    ctx.context,
    { spend: { taskID: 'conversation', dollars: 0.03 }, logger: ctx.logger },
    () =>
      writeStepCommit(ctx.context, step.claim, {
        next: 'wait',
        records: [],
        acknowledged: [step.messageSequence],
        timers: [{ dueAt: Number.NaN }],
      }),
  ).then(
    () => null,
    (error: unknown) => error,
  );

  expect(outcome).toStrictEqual(new Error("a step's timer is due at NaN, which is no time"));

  expect(ctx.events).toStrictEqual([
    {
      event: 'task.turn_spend_unrecorded',
      fields: {
        taskID: 'conversation',
        dollars: 0.03,
        error: expect.any(String),
        message: expect.any(String),
      },
    },
  ]);
});
