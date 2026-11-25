import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { readInbox } from '@heynixie/tasks';
import { buildTaskSeeder } from '@heynixie/tasks/test-utils';
import { deliverTriggerBatch } from '../core/deliver-trigger-batch';
import {
  buildTestMailEvent,
  readTestTriggerRows,
  seedWakeRule,
  startTestTriggers,
} from '../test-utils';
import type { MailArrivalEvent } from '../types';

async function setupTest() {
  const triggers = await startTestTriggers();

  return {
    ...triggers,
    taskSeed: buildTaskSeeder({ context: triggers.context }),
    deliverMail: (events: readonly MailArrivalEvent[]) =>
      deliverTriggerBatch(triggers.core, 'mail', { cursor: null, events }),
    readKinds: async (kind: 'trigger.mail_arrived' | 'trigger.mail_woke') => {
      const records = await readRecords(triggers.context.log, { afterSequence: 0, kinds: [kind] });

      return records.map((entry) => entry.record);
    },
  };
}

test('it writes nothing for a mail that no rule matches', async () => {
  const ctx = await setupTest();

  await ctx.taskSeed.conversationStep();

  await seedWakeRule(ctx, { match: { from: ['@school.example.org'] } });

  ctx.clock.advance(1000);

  const result = await ctx.deliverMail([
    buildTestMailEvent({ payload: { receivedAt: ctx.clock.now() } }),
  ]);

  const rows = await readTestTriggerRows(ctx);

  expect(result).toStrictEqual({ delivered: 0 });

  const awaited1 = await ctx.readKinds('trigger.mail_arrived');

  expect(awaited1).toStrictEqual([]);

  const awaited2 = await ctx.readKinds('trigger.mail_woke');

  expect(awaited2).toStrictEqual([]);
  expect(rows.keys).toStrictEqual([]);
});

test('it writes nothing for a mail while no rule exists', async () => {
  const ctx = await setupTest();

  await ctx.taskSeed.conversationStep();

  const result = await ctx.deliverMail([buildTestMailEvent()]);

  expect(result).toStrictEqual({ delivered: 0 });

  const awaited3 = await ctx.readKinds('trigger.mail_woke');

  expect(awaited3).toStrictEqual([]);
});

test('it wakes the conversation with the mail that a rule matches', async () => {
  const ctx = await setupTest();

  await ctx.taskSeed.conversationStep();

  const rule = await seedWakeRule(ctx, { match: { from: ['@library.example.org'] } });

  ctx.clock.advance(1000);

  const result = await ctx.deliverMail([
    buildTestMailEvent({ payload: { receivedAt: ctx.clock.now() } }),
  ]);

  const [woke] = await ctx.readKinds('trigger.mail_woke');

  expect(result).toStrictEqual({ delivered: 1 });
  expect(woke?.thread).toBe('conversation');

  expect(woke?.payload).toMatchObject({
    taskID: 'conversation',
    mailbox: 'mail',
    rules: [{ ruleID: rule.ruleID, shortID: rule.shortID }],
    mails: [{ messageID: 'mz4k8q2w7p', threadID: 'th6p2k9w4x' }],
  });

  expect(woke?.erasable).toMatchObject({
    status: 'readable',
    fields: { mails: [{ from: 'hello@library.example.org', subject: 'Your sign-in code' }] },
  });
});

test('it wakes the task that a rule names, and no other', async () => {
  const ctx = await setupTest();
  const starter = await ctx.taskSeed.conversationStep();

  const taskID = await ctx.taskSeed.waitingTask({
    starter: starter.claim,
    name: 'Library watcher',
    brief: 'Wait for the library code.',
  });

  await seedWakeRule(ctx, { target: { kind: 'task', taskID }, setBy: taskID });

  ctx.clock.advance(1000);

  await ctx.deliverMail([buildTestMailEvent({ payload: { receivedAt: ctx.clock.now() } })]);

  const inbox = await readInbox(ctx.context, taskID);

  expect(inbox.map((record) => record.kind)).toStrictEqual(['trigger.mail_woke']);
});

test('it holds a second mail that arrives within the rule window', async () => {
  const ctx = await setupTest();

  await ctx.taskSeed.conversationStep();

  await seedWakeRule(ctx, { windowMs: 600_000 });

  ctx.clock.advance(1000);

  await ctx.deliverMail([buildTestMailEvent({ payload: { receivedAt: ctx.clock.now() } })]);

  ctx.clock.advance(1000);

  const result = await ctx.deliverMail([
    buildTestMailEvent({ dedupeKey: 'host-2', payload: { receivedAt: ctx.clock.now() } }),
  ]);

  const rows = await readTestTriggerRows(ctx);

  expect(result).toStrictEqual({ delivered: 1 });

  const awaited4 = await ctx.readKinds('trigger.mail_woke');

  expect(awaited4).toHaveLength(1);
  expect(rows.held).toHaveLength(1);
});

test('it drops a mail whose key it holds', async () => {
  const ctx = await setupTest();

  await ctx.taskSeed.conversationStep();

  await seedWakeRule(ctx, { windowMs: 1000 });

  ctx.clock.advance(1000);

  const event = buildTestMailEvent({ payload: { receivedAt: ctx.clock.now() } });

  await ctx.deliverMail([event]);

  const result = await ctx.deliverMail([event]);

  expect(result).toStrictEqual({ delivered: 0 });

  const awaited5 = await ctx.readKinds('trigger.mail_arrived');

  expect(awaited5).toHaveLength(1);
});

test('it ignores mail that the host received before the rule was set', async () => {
  const ctx = await setupTest();

  await ctx.taskSeed.conversationStep();

  const receivedAt = ctx.clock.now();

  ctx.clock.advance(5000);

  await seedWakeRule(ctx);

  const result = await ctx.deliverMail([buildTestMailEvent({ payload: { receivedAt } })]);

  expect(result).toStrictEqual({ delivered: 0 });
});

test('it ignores mail that the host received at or after the rule expired', async () => {
  const ctx = await setupTest();

  await ctx.taskSeed.conversationStep();

  await seedWakeRule(ctx, { expiresAt: ctx.clock.now() + 1000 });

  ctx.clock.advance(1000);

  const result = await ctx.deliverMail([
    buildTestMailEvent({ payload: { receivedAt: ctx.clock.now() } }),
  ]);

  expect(result).toStrictEqual({ delivered: 0 });
});

test('it wakes a target once when 2 of its rules match', async () => {
  const ctx = await setupTest();

  await ctx.taskSeed.conversationStep();

  await seedWakeRule(ctx, { match: { from: ['@library.example.org'] } });
  await seedWakeRule(ctx, { match: { subject: 'code' } });

  ctx.clock.advance(1000);

  await ctx.deliverMail([buildTestMailEvent({ payload: { receivedAt: ctx.clock.now() } })]);

  const [woke] = await ctx.readKinds('trigger.mail_woke');
  const awaited6 = await ctx.readKinds('trigger.mail_woke');

  expect(awaited6).toHaveLength(1);
  expect(woke?.payload['rules']).toHaveLength(2);
});

test('it ends the rule of a task that ended, and wakes nothing', async () => {
  const ctx = await setupTest();
  const starter = await ctx.taskSeed.conversationStep();

  const taskID = await ctx.taskSeed.doneTask({
    starter: starter.claim,
    name: 'Library watcher',
    brief: 'Wait for the library code.',
  });

  await seedWakeRule(ctx, { target: { kind: 'task', taskID }, setBy: taskID });

  ctx.clock.advance(1000);

  const result = await ctx.deliverMail([
    buildTestMailEvent({ payload: { receivedAt: ctx.clock.now() } }),
  ]);

  const ended = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['trigger.wake_rule_ended'],
  });

  expect(result).toStrictEqual({ delivered: 0 });
  expect(ended.map((entry) => entry.record.payload['reason'])).toStrictEqual(['task_ended']);
});

test('it deletes the key of an arrival that no held match names', async () => {
  const ctx = await setupTest();

  await ctx.taskSeed.conversationStep();

  await seedWakeRule(ctx);

  ctx.clock.advance(1000);

  await ctx.deliverMail([buildTestMailEvent({ payload: { receivedAt: ctx.clock.now() } })]);

  const [arrived] = await ctx.readKinds('trigger.mail_arrived');

  expect(arrived?.erasable).toStrictEqual({ status: 'shredded' });
});

test('it keeps the key of an arrival that a held match names', async () => {
  const ctx = await setupTest();

  await ctx.taskSeed.conversationStep();

  await seedWakeRule(ctx, { windowMs: 600_000 });

  ctx.clock.advance(1000);

  await ctx.deliverMail([buildTestMailEvent({ payload: { receivedAt: ctx.clock.now() } })]);

  ctx.clock.advance(1000);

  await ctx.deliverMail([
    buildTestMailEvent({ dedupeKey: 'host-2', payload: { receivedAt: ctx.clock.now() } }),
  ]);

  const arrivals = await ctx.readKinds('trigger.mail_arrived');

  expect(arrivals.map((arrived) => arrived.erasable.status)).toStrictEqual([
    'shredded',
    'readable',
  ]);
});
