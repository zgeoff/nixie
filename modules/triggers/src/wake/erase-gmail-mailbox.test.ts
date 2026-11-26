import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { buildTaskSeeder } from '@heynixie/tasks/test-utils';
import { deliverTriggerBatch } from '../core/deliver-trigger-batch';
import {
  buildTestMailEvent,
  readTestTriggerRows,
  seedWakeRule,
  startTestTriggers,
} from '../test-utils';
import { eraseGmailMailbox } from './erase-gmail-mailbox';
import { readWakeRules } from './read-wake-rules';
import { runWakeFlush } from './run-wake-flush';

async function setupTest() {
  const triggers = await startTestTriggers();

  return {
    ...triggers,
    taskSeed: buildTaskSeeder({ context: triggers.context }),
    deliver: (connectionID: string, dedupeKey: string) =>
      deliverTriggerBatch(triggers.core, 'gmail', {
        cursor: null,
        events: [
          buildTestMailEvent({
            mailbox: { kind: 'gmail', connectionID },
            dedupeKey: `${connectionID}|${dedupeKey}`,
            payload: { receivedAt: triggers.clock.now(), subject: 'Your invoice' },
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

test('#eraseGmailMailbox ends the rules of the connection and erases the text of its wakes', async () => {
  const ctx = await setupTest();

  await ctx.taskSeed.conversationStep();

  await seedWakeRule(ctx, { mailbox: { kind: 'gmail', connectionID: 'conn-1' } });

  ctx.clock.advance(1000);

  await ctx.deliver('conn-1', 'm1');

  await eraseGmailMailbox(ctx.core, 'conn-1');

  const [woke] = await ctx.readWakes();

  const rules = await readWakeRules(ctx.writer.db, {
    mailbox: { kind: 'gmail', connectionID: 'conn-1' },
    at: ctx.clock.now(),
  });

  expect(rules).toStrictEqual([]);
  expect(woke?.erasable.status).not.toBe('readable');
});

test('#eraseGmailMailbox drops the held matches of the connection and keeps no arrival key', async () => {
  const ctx = await setupTest();

  await ctx.taskSeed.conversationStep();

  await seedWakeRule(ctx, {
    mailbox: { kind: 'gmail', connectionID: 'conn-1' },
    windowMs: 600_000,
  });

  ctx.clock.advance(1000);

  await ctx.deliver('conn-1', 'm1');

  ctx.clock.advance(1000);

  await ctx.deliver('conn-1', 'm2');

  await eraseGmailMailbox(ctx.core, 'conn-1');

  ctx.clock.advance(600_000);

  const flushed = await runWakeFlush(ctx.core);
  const rows = await readTestTriggerRows(ctx);

  expect(flushed).toBe(0);
  expect(rows.held).toStrictEqual([]);
});

test('#eraseGmailMailbox leaves the rules and wakes of another connection', async () => {
  const ctx = await setupTest();

  await ctx.taskSeed.conversationStep();

  await seedWakeRule(ctx, { mailbox: { kind: 'gmail', connectionID: 'conn-2' } });

  ctx.clock.advance(1000);

  await ctx.deliver('conn-2', 'm1');

  await eraseGmailMailbox(ctx.core, 'conn-1');

  const [woke] = await ctx.readWakes();

  const rules = await readWakeRules(ctx.writer.db, {
    mailbox: { kind: 'gmail', connectionID: 'conn-2' },
    at: ctx.clock.now(),
  });

  expect(rules).toHaveLength(1);
  expect(woke?.erasable.status).toBe('readable');
});
