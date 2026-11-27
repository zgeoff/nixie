import { expect, onTestFinished, test } from 'bun:test';
import { readRecords, withWriteTransaction } from '@heynixie/log';
import { writeTaskControl } from '@heynixie/tasks';
import { buildTaskSeeder } from '@heynixie/tasks/test-utils';
import { deliverTriggerBatch } from '../core/deliver-trigger-batch';
import {
  buildTestMailEvent,
  buildTestTextEvent,
  buildTestTextSource,
  readTestTriggerRows,
  seedWakeRule,
  startTestTriggers,
} from '../test-utils';
import { endWakeRuleInTransaction } from './end-wake-rule-in-transaction';
import { runWakeFlush } from './run-wake-flush';
import { textSources } from './text-sources';
import { writeMailArrival } from './write-mail-arrival';

async function setupTest() {
  const triggers = await startTestTriggers();

  const text = buildTestTextSource();

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
    text,
    deliverText: (dedupeKey: string) => {
      textSources.set([text.source]);

      onTestFinished(() => {
        textSources.set([]);
      });

      return deliverTriggerBatch(triggers.core, 'test-texts', {
        cursor: null,
        events: [buildTestTextEvent({ dedupeKey, payload: { receivedAt: triggers.clock.now() } })],
      });
    },
    readArrivals: async () => {
      const records = await readRecords(triggers.context.log, {
        afterSequence: 0,
        kinds: ['trigger.mail_arrived'],
      });

      return records.map((entry) => entry.record);
    },
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

  const written = await runWakeFlush(ctx.core, { liveSources: ['example'] });
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

  await runWakeFlush(ctx.core, { liveSources: ['example'] });

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

  const written = await runWakeFlush(ctx.core, { liveSources: ['example'] });

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

  const awaited1 = await runWakeFlush(ctx.core, { liveSources: ['example'] });

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

  const written = await runWakeFlush(ctx.core, { liveSources: ['example'] });
  const rows = await readTestTriggerRows(ctx);

  expect(written).toBe(0);
  expect(rows.held).toStrictEqual([]);
});

test('#runWakeFlush drops the held matches of a cancelled rule once its task ended, and its keys', async () => {
  const ctx = await setupTest();
  const starter = await ctx.taskSeed.conversationStep();

  const taskID = await ctx.taskSeed.waitingTask({
    starter: starter.claim,
    name: 'Library watcher',
    brief: 'Wait for the library code.',
  });

  const rule = await seedWakeRule(ctx, {
    target: { kind: 'task', taskID },
    setBy: taskID,
    windowMs: 60_000,
  });

  ctx.clock.advance(1000);

  await ctx.deliverMail('host-1', 'Your code');

  ctx.clock.advance(1000);

  await ctx.deliverMail('host-2', 'Your new code');

  await withWriteTransaction(ctx.writer, (tx) =>
    endWakeRuleInTransaction(tx, ctx.core, rule.ruleID, 'cancelled'),
  );

  await writeTaskControl(ctx.context, { taskID, control: 'close' });

  const written = await runWakeFlush(ctx.core, { liveSources: ['example'] });
  const rows = await readTestTriggerRows(ctx);
  const arrivals = await ctx.readArrivals();

  expect(written).toBe(0);
  expect(rows.held).toStrictEqual([]);
  expect(arrivals.map((record) => record.erasable.status)).not.toContain('readable');
});

test('#runWakeFlush removes the key of an arrival whose delivery crashed before its clean-up', async () => {
  const ctx = await setupTest();

  await ctx.taskSeed.conversationStep();

  await seedWakeRule(ctx, { windowMs: 60_000 });

  ctx.clock.advance(1000);

  await withWriteTransaction(ctx.writer, (tx) =>
    writeMailArrival(
      tx,
      ctx.core,
      'mail',
      buildTestMailEvent({ payload: { receivedAt: ctx.clock.now() } }),
    ),
  );

  const before = await ctx.readArrivals();

  await runWakeFlush(ctx.core, { liveSources: ['example'] });

  const after = await ctx.readArrivals();

  expect(before.map((record) => record.erasable.status)).toStrictEqual(['readable']);
  expect(after.map((record) => record.erasable.status)).not.toContain('readable');
});

test('#runWakeFlush wakes no rule twice inside its window when an arrival wakes it first', async () => {
  const ctx = await setupTest();

  await ctx.taskSeed.conversationStep();

  await seedWakeRule(ctx, { windowMs: 60_000 });

  ctx.clock.advance(1000);

  await ctx.deliverMail('host-1', 'Your code');

  ctx.clock.advance(1000);

  await ctx.deliverMail('host-2', 'Your new code');

  ctx.clock.advance(60_000);

  // the flush reads the clock to decide which rules are ready, and the arrival of a third mail is
  // sent at that moment: it reaches the writer before a flush that decided outside its transaction
  // and writes, and after one that decided inside it
  const races: Promise<unknown>[] = [];

  const flushing = {
    ...ctx.core,
    clock: {
      ...ctx.core.clock,
      now: () => {
        if (races.length === 0) {
          races.push(ctx.deliverMail('host-3', 'Your newest code'));
        }

        return ctx.clock.now();
      },
    },
  };

  const written = await runWakeFlush(flushing, { liveSources: ['example'] });

  await Promise.all(races);

  const wakes = await ctx.readWakes();
  const rows = await readTestTriggerRows(ctx);

  expect(written).toBe(1);
  expect(wakes).toHaveLength(2);
  expect(rows.held).toHaveLength(1);
});

test('#runWakeFlush leaves a held match of a connection at a source that does not run, and wakes it once the source runs', async () => {
  const ctx = await setupTest();

  await ctx.taskSeed.conversationStep();

  await seedWakeRule(ctx, {
    mailbox: { kind: 'connection', source: 'example', connectionID: 'conn-1' },
    windowMs: 60_000,
  });

  ctx.clock.advance(1000);

  const deliver = (dedupeKey: string) =>
    deliverTriggerBatch(ctx.core, 'example', {
      cursor: null,
      events: [
        buildTestMailEvent({
          mailbox: { kind: 'connection', source: 'example', connectionID: 'conn-1' },
          dedupeKey,
          payload: { receivedAt: ctx.clock.now() },
        }),
      ],
    });

  // the first mail wakes at once, and the second is held until the window ends
  await deliver('conn-1|m1');

  ctx.clock.advance(1000);

  await deliver('conn-1|m2');

  ctx.clock.advance(60_000);

  const whileOff = await runWakeFlush(ctx.core, { liveSources: [] });
  const wokeWhileOff = await ctx.readWakes();
  const whileOn = await runWakeFlush(ctx.core, { liveSources: ['example'] });
  const wokeWhileOn = await ctx.readWakes();

  expect([whileOff, wokeWhileOff.length, whileOn, wokeWhileOn.length]).toStrictEqual([0, 1, 1, 2]);
});

test('#runWakeFlush keeps the held texts of a source that is off, and wakes with them once it is on', async () => {
  const ctx = await setupTest();

  await ctx.taskSeed.conversationStep();

  await seedWakeRule(ctx, {
    mailbox: { kind: 'source', sourceID: 'test-texts' },
    windowMs: 60_000,
  });

  ctx.clock.advance(1000);

  await ctx.deliverText('text-1');

  ctx.clock.advance(1000);

  await ctx.deliverText('text-2');

  ctx.clock.advance(60_000);
  textSources.set([]);

  const whileOff = await runWakeFlush(ctx.core, { liveSources: [] });

  textSources.set([ctx.text.source]);

  const whileOn = await runWakeFlush(ctx.core, { liveSources: [] });

  expect(whileOff).toBe(0);
  expect(whileOn).toBe(1);
});

test('#runWakeFlush wakes with nothing for a held text that its feature forgot', async () => {
  const ctx = await setupTest();

  await ctx.taskSeed.conversationStep();

  await seedWakeRule(ctx, {
    mailbox: { kind: 'source', sourceID: 'test-texts' },
    windowMs: 60_000,
  });

  ctx.clock.advance(1000);

  await ctx.deliverText('text-1');

  ctx.clock.advance(1000);

  await ctx.deliverText('text-2');

  ctx.clock.advance(60_000);
  ctx.text.forget();

  const written = await runWakeFlush(ctx.core, { liveSources: [] });

  expect(written).toBe(0);
});

test('#runWakeFlush wakes a target apart for its held mail and its held texts', async () => {
  const ctx = await setupTest();

  await ctx.taskSeed.conversationStep();

  await seedWakeRule(ctx, { windowMs: 60_000 });

  await seedWakeRule(ctx, {
    mailbox: { kind: 'source', sourceID: 'test-texts' },
    windowMs: 60_000,
  });

  ctx.clock.advance(1000);

  await ctx.deliverMail('host-1', 'Your code');
  await ctx.deliverText('text-1');

  ctx.clock.advance(1000);

  await ctx.deliverMail('host-2', 'Your new code');
  await ctx.deliverText('text-2');

  ctx.clock.advance(60_000);

  const written = await runWakeFlush(ctx.core, { liveSources: [] });
  const wakes = await ctx.readWakes();

  const mailboxes = wakes.slice(2).map((wake) => wake.payload['mails']);

  expect(written).toBe(2);

  expect(mailboxes).toIncludeSameMembers([
    [expect.objectContaining({ mailbox: 'mail' })],
    [expect.objectContaining({ mailbox: 'source:test-texts' })],
  ]);
});
