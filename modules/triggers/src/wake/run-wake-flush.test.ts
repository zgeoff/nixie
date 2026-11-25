import { expect, test } from 'bun:test';
import { readRecords, withWriteTransaction } from '@heynixie/log';
import { writeTaskControl } from '@heynixie/tasks';
import { buildTaskSeeder } from '@heynixie/tasks/test-utils';
import { deliverTriggerBatch } from '../core/deliver-trigger-batch';
import {
  buildTestMailEvent,
  readTestTriggerRows,
  seedWakeRule,
  startTestTriggers,
} from '../test-utils';
import { endWakeRuleInTransaction } from './end-wake-rule-in-transaction';
import { runWakeFlush } from './run-wake-flush';

async function setupTest() {
  const triggers = await startTestTriggers();

  return {
    ...triggers,
    taskSeed: buildTaskSeeder({ context: triggers.context }),
    deliverMail: (dedupeKey: string, subject: string) =>
      deliverTriggerBatch(triggers.core, 'mail', {
        cursor: null,
        events: [
          buildTestMailEvent({
            dedupeKey,
            payload: { receivedAt: triggers.clock.now(), subject },
          }),
        ],
      }),
    readWakes: async () => {
      const records = await readRecords(triggers.context.log, {
        afterSequence: 0,
        kinds: ['trigger.mail_woke'],
      });

      return records.map((entry) => entry.record);
    },
  };
}

test('#runWakeFlush wakes with every held mail once the window ran out, oldest first', async () => {
  const ctx = await setupTest();

  await ctx.taskSeed.conversationStep();

  await seedWakeRule(ctx, { windowMs: 60_000 });

  ctx.clock.advance(1000);

  await ctx.deliverMail('host-1', 'Your code');

  ctx.clock.advance(1000);

  await ctx.deliverMail('host-2', 'Your new code');

  ctx.clock.advance(1000);

  await ctx.deliverMail('host-3', 'Your newest code');

  ctx.clock.advance(60_000);

  const written = await runWakeFlush(ctx.core);
  const wakes = await ctx.readWakes();

  expect(written).toBe(1);
  expect(wakes).toHaveLength(2);

  expect(wakes[1]?.erasable).toMatchObject({
    fields: {
      mails: [{ subject: 'Your new code' }, { subject: 'Your newest code' }],
    },
  });
});

test('#runWakeFlush clears the held matches that it showed', async () => {
  const ctx = await setupTest();

  await ctx.taskSeed.conversationStep();

  await seedWakeRule(ctx, { windowMs: 60_000 });

  ctx.clock.advance(1000);

  await ctx.deliverMail('host-1', 'Your code');

  ctx.clock.advance(1000);

  await ctx.deliverMail('host-2', 'Your new code');

  ctx.clock.advance(60_000);

  await runWakeFlush(ctx.core);

  const rows = await readTestTriggerRows(ctx);

  expect(rows.held).toStrictEqual([]);
});

test('#runWakeFlush waits while a rule is inside its window', async () => {
  const ctx = await setupTest();

  await ctx.taskSeed.conversationStep();

  await seedWakeRule(ctx, { windowMs: 60_000 });

  ctx.clock.advance(1000);

  await ctx.deliverMail('host-1', 'Your code');

  ctx.clock.advance(1000);

  await ctx.deliverMail('host-2', 'Your new code');

  ctx.clock.advance(30_000);

  const written = await runWakeFlush(ctx.core);

  expect(written).toBe(0);
});

test('#runWakeFlush still wakes for the match of a rule that was cancelled', async () => {
  const ctx = await setupTest();

  await ctx.taskSeed.conversationStep();

  const rule = await seedWakeRule(ctx, { windowMs: 60_000 });

  ctx.clock.advance(1000);

  await ctx.deliverMail('host-1', 'Your code');

  ctx.clock.advance(1000);

  await ctx.deliverMail('host-2', 'Your new code');

  await withWriteTransaction(ctx.writer, (tx) =>
    endWakeRuleInTransaction(tx, ctx.core, rule.ruleID, 'cancelled'),
  );

  ctx.clock.advance(60_000);

  const awaited1 = await runWakeFlush(ctx.core);

  expect(awaited1).toBe(1);
});

test('#runWakeFlush ends the rules of a task that ended and drops its held matches', async () => {
  const ctx = await setupTest();
  const starter = await ctx.taskSeed.conversationStep();

  const taskID = await ctx.taskSeed.waitingTask({
    starter: starter.claim,
    name: 'Library watcher',
    brief: 'Wait for the library code.',
  });

  await seedWakeRule(ctx, { target: { kind: 'task', taskID }, setBy: taskID, windowMs: 60_000 });

  ctx.clock.advance(1000);

  await ctx.deliverMail('host-1', 'Your code');

  ctx.clock.advance(1000);

  await ctx.deliverMail('host-2', 'Your new code');

  await writeTaskControl(ctx.context, { taskID, control: 'close' });

  ctx.clock.advance(60_000);

  const written = await runWakeFlush(ctx.core);
  const rows = await readTestTriggerRows(ctx);

  expect(written).toBe(0);
  expect(rows.held).toStrictEqual([]);
});
