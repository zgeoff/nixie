import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { buildTaskSeeder } from '@heynixie/tasks/test-utils';
import { deliverTriggerBatch } from '../core/deliver-trigger-batch';
import { buildTestMailEvent, seedWakeRule, startTestTriggers } from '../test-utils';
import { readGmailWakeRecords } from './read-gmail-wake-records';
import { runWakeFlush } from './run-wake-flush';

async function setupTest() {
  const triggers = await startTestTriggers();

  await buildTaskSeeder({ context: triggers.context }).conversationStep();

  return {
    ...triggers,
    deliver: (connectionID: string, subject: string) =>
      deliverTriggerBatch(triggers.core, 'gmail', {
        cursor: null,
        events: [
          buildTestMailEvent({
            mailbox: { kind: 'gmail', connectionID },
            dedupeKey: `${connectionID}|${subject}`,
            payload: { receivedAt: triggers.clock.now(), subject },
          }),
        ],
      }),
    readWakeSequences: async () => {
      const records = await readRecords(triggers.context.log, {
        afterSequence: 0,
        kinds: ['trigger.mail_woke'],
      });

      return records.map((entry) => entry.record.sequence);
    },
  };
}

test('#readGmailWakeRecords finds the wakes that show mail of the connection, and none of another', async () => {
  const ctx = await setupTest();

  await seedWakeRule(ctx, { mailbox: { kind: 'gmail', connectionID: 'conn-1' } });
  await seedWakeRule(ctx, { mailbox: { kind: 'gmail', connectionID: 'conn-2' } });

  ctx.clock.advance(1000);

  await ctx.deliver('conn-1', 'Invoice 4417 for tide tables');
  await ctx.deliver('conn-2', 'Invoice 8120 for bee hives');

  const [first, second] = await ctx.readWakeSequences();
  const one = await readGmailWakeRecords(ctx.writer.db, 'conn-1');
  const two = await readGmailWakeRecords(ctx.writer.db, 'conn-2');

  expect([one, two]).toStrictEqual([
    [{ sequence: first ?? 0, thread: 'conversation', keyID: expect.any(String) }],
    [{ sequence: second ?? 0, thread: 'conversation', keyID: expect.any(String) }],
  ]);
});

test('#readGmailWakeRecords finds the one wake of a target that shows the mail of 2 mailboxes, for each of them', async () => {
  const ctx = await setupTest();

  await seedWakeRule(ctx, {
    mailbox: { kind: 'gmail', connectionID: 'conn-1' },
    windowMs: 600_000,
  });

  await seedWakeRule(ctx, {
    mailbox: { kind: 'gmail', connectionID: 'conn-2' },
    windowMs: 600_000,
  });

  ctx.clock.advance(1000);

  await ctx.deliver('conn-1', 'First invoice');
  await ctx.deliver('conn-2', 'Second invoice');

  ctx.clock.advance(1000);

  await ctx.deliver('conn-1', 'Third invoice');
  await ctx.deliver('conn-2', 'Fourth invoice');

  ctx.clock.advance(600_000);

  await runWakeFlush(ctx.core);

  const sequences = await ctx.readWakeSequences();
  const one = await readGmailWakeRecords(ctx.writer.db, 'conn-1');
  const two = await readGmailWakeRecords(ctx.writer.db, 'conn-2');

  expect([
    sequences,
    one.map((wake) => wake.sequence),
    two.map((wake) => wake.sequence),
  ]).toStrictEqual([
    expect.toBeArrayOfSize(3),
    expect.toBeArrayOfSize(2),
    expect.toBeArrayOfSize(2),
  ]);
});
