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
import { eraseConnectionMailbox } from './erase-connection-mailbox';
import { readWakeRules } from './read-wake-rules';
import { runWakeFlush } from './run-wake-flush';

async function setupTest() {
  const triggers = await startTestTriggers();

  return {
    ...triggers,
    taskSeed: buildTaskSeeder({ context: triggers.context }),
    connection: (connectionID: string) =>
      ({ kind: 'connection', source: 'example', connectionID }) as const,
    deliver: (connectionID: string, dedupeKey: string) =>
      deliverTriggerBatch(triggers.core, 'example', {
        cursor: null,
        events: [
          buildTestMailEvent({
            mailbox: { kind: 'connection', source: 'example', connectionID },
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

test('#eraseConnectionMailbox ends the rules of the connection and erases the text of its wakes', async () => {
  const ctx = await setupTest();

  await ctx.taskSeed.conversationStep();

  await seedWakeRule(ctx, {
    mailbox: { kind: 'connection', source: 'example', connectionID: 'conn-1' },
  });

  ctx.clock.advance(1000);

  await ctx.deliver('conn-1', 'm1');

  await eraseConnectionMailbox(ctx.core, ctx.connection('conn-1'));

  const [woke] = await ctx.readWakes();

  const rules = await readWakeRules(ctx.writer.db, {
    mailbox: { kind: 'connection', source: 'example', connectionID: 'conn-1' },
    at: ctx.clock.now(),
  });

  expect(rules).toStrictEqual([]);
  expect(woke?.erasable.status).not.toBe('readable');
});

test('#eraseConnectionMailbox drops the held matches of the connection and keeps no arrival key', async () => {
  const ctx = await setupTest();

  await ctx.taskSeed.conversationStep();

  await seedWakeRule(ctx, {
    mailbox: { kind: 'connection', source: 'example', connectionID: 'conn-1' },
    windowMs: 600_000,
  });

  ctx.clock.advance(1000);

  await ctx.deliver('conn-1', 'm1');

  ctx.clock.advance(1000);

  await ctx.deliver('conn-1', 'm2');

  await eraseConnectionMailbox(ctx.core, ctx.connection('conn-1'));

  ctx.clock.advance(600_000);

  const flushed = await runWakeFlush(ctx.core, { liveSources: ['example'] });
  const rows = await readTestTriggerRows(ctx);

  expect(flushed).toBe(0);
  expect(rows.held).toStrictEqual([]);
});

test('#eraseConnectionMailbox leaves the rules and wakes of another connection', async () => {
  const ctx = await setupTest();

  await ctx.taskSeed.conversationStep();

  await seedWakeRule(ctx, {
    mailbox: { kind: 'connection', source: 'example', connectionID: 'conn-2' },
  });

  ctx.clock.advance(1000);

  await ctx.deliver('conn-2', 'm1');

  await eraseConnectionMailbox(ctx.core, ctx.connection('conn-1'));

  const [woke] = await ctx.readWakes();

  const rules = await readWakeRules(ctx.writer.db, {
    mailbox: { kind: 'connection', source: 'example', connectionID: 'conn-2' },
    at: ctx.clock.now(),
  });

  expect(rules).toHaveLength(1);
  expect(woke?.erasable.status).toBe('readable');
});
