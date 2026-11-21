import { expect, test } from 'bun:test';
import { withWriteTransaction, writeRecords } from '@heynixie/log';
import { writeReminderVersion } from '@heynixie/reminders';
import invariant from 'tiny-invariant';
import { buildMockTaskMessageView } from '../test-utils/build-mock-task-message-view';
import { startTestTasks } from '../test-utils/start-test-tasks';
import { makeGapReader } from './make-gap-reader';
import { readInboxMessages } from './read-inbox-messages';

async function setupTest() {
  const startMs = Date.parse('2026-11-21T00:00:00Z');

  const tasks = await startTestTasks({ recordsAtMs: startMs });

  const definitions = { snapshotHash: 'sha256:test' };
  const times = { defaultZone: 'Australia/Sydney', now: new Date(startMs) };

  return {
    ...tasks,
    advanceMinutes: (minutes: number) => {
      tasks.clock.advance(minutes * 60_000);
    },
    writeOwnerMessage: async (text: string) => {
      const [record] = await writeRecords(tasks.context.log, [
        { kind: 'owner_message', definitions, thread: 'conversation', erasable: { text } },
      ]);

      invariant(record, 'the owner message was not written');

      return record;
    },
    writeTurnEnded: () =>
      writeRecords(tasks.context.log, [
        { kind: 'model.turn_ended', definitions, thread: 'conversation' },
      ]),
    writeTurnFailed: () =>
      writeRecords(tasks.context.log, [
        {
          kind: 'task.step_errored',
          definitions,
          thread: 'conversation',
          payload: { taskID: 'conversation', nextState: 'ready', errors: 1, claimableAt: startMs },
        },
      ]),
    writeReminderFire: async () => {
      await withWriteTransaction(tasks.writer, (tx) =>
        writeReminderVersion(tx, 'hash-1', {
          name: 'Dentist',
          note: 'Call the dentist.',
          trigger: { at: '2026-11-21T14:00:00+11:00' },
        }),
      );

      return writeRecords(tasks.context.log, [
        {
          kind: 'trigger.fired',
          definitions,
          thread: 'conversation',
          payload: {
            definitionID: 'call-the-dentist',
            definitionHash: 'hash-1',
            source: 'at',
            dedupeKey: 'key-1',
            kind: 'at',
            scheduledFor: '2026-11-21T03:00:00.000Z',
            firedAt: '2026-11-21T03:00:00.000Z',
            isCatchUp: false,
            skipped: [],
            skippedCount: 0,
          },
        },
      ]);
    },
    readOpeningTags: async (records: Awaited<ReturnType<typeof writeRecords>>) => {
      const read = await readInboxMessages(tasks.context, records, {
        times,
        view: buildMockTaskMessageView(),
        imageBudget: { bytes: 1024, count: 100 },
        gaps: makeGapReader(tasks.context),
      });

      return read.messages.map((message) => message.text.split('\n')[0]);
    },
  };
}

test('it shows both gaps on the owner message that starts the turn', async () => {
  const ctx = await setupTest();

  await ctx.writeOwnerMessage('Morning.');

  ctx.advanceMinutes(28);

  await ctx.writeTurnEnded();

  ctx.advanceMinutes(3 * 60 + 12);

  const record = await ctx.writeOwnerMessage('Back again.');
  const tags = await ctx.readOpeningTags([record]);

  expect(tags).toStrictEqual([
    '<owner-message id="3" from="the owner" sent="Sat 21 Nov, 14:40, Sydney" since-your-last-turn="3 h 12 min" since-owner-last-wrote="3 h 40 min">',
  ]);
});

test('it measures the gap since the owner wrote from the newest owner message on a reminder turn', async () => {
  const ctx = await setupTest();

  await ctx.writeOwnerMessage('Remind me about the dentist.');

  ctx.advanceMinutes(2);

  await ctx.writeTurnEnded();

  ctx.advanceMinutes(38);

  const fire = await ctx.writeReminderFire();

  ctx.advanceMinutes(20);

  const [first] = await ctx.readOpeningTags(fire);

  expect(first).toStartWith('<system-message type="reminder"');
  expect(first).toInclude('since-your-last-turn="58 min" since-owner-last-wrote="1 h"');
});

test('it counts a failed turn as the end of the previous turn', async () => {
  const ctx = await setupTest();

  await ctx.writeOwnerMessage('Hello.');

  ctx.advanceMinutes(5);

  await ctx.writeTurnFailed();

  ctx.advanceMinutes(7);

  const fire = await ctx.writeReminderFire();
  const [first] = await ctx.readOpeningTags(fire);

  expect(first).toInclude('since-your-last-turn="7 min" since-owner-last-wrote="12 min"');
});

test('it leaves out both gaps on the first turn of a conversation whose owner never wrote', async () => {
  const ctx = await setupTest();
  const fire = await ctx.writeReminderFire();
  const [first] = await ctx.readOpeningTags(fire);

  expect(first).not.toInclude('since-');
});

test('it leaves out the gap since the last turn on the first turn of the conversation', async () => {
  const ctx = await setupTest();
  const record = await ctx.writeOwnerMessage('Hello.');
  const tags = await ctx.readOpeningTags([record]);

  expect(tags).toStrictEqual([
    '<owner-message id="1" from="the owner" sent="Sat 21 Nov, 11:00, Sydney">',
  ]);
});

test('it leaves out the gap since the owner wrote when the owner never has', async () => {
  const ctx = await setupTest();

  await ctx.writeTurnEnded();

  ctx.advanceMinutes(90);

  const fire = await ctx.writeReminderFire();
  const [first] = await ctx.readOpeningTags(fire);

  expect(first).toInclude('since-your-last-turn="1 h 30 min"');
  expect(first).not.toInclude('since-owner-last-wrote');
});

test('it measures an owner message that cuts into a turn from the end of the previous turn and the previous owner message', async () => {
  const ctx = await setupTest();

  await ctx.writeOwnerMessage('First.');

  ctx.advanceMinutes(1);

  await ctx.writeTurnEnded();

  ctx.advanceMinutes(10);

  const cut = await ctx.writeOwnerMessage('Wait, one more thing.');

  ctx.advanceMinutes(1);

  const gaps = await makeGapReader(ctx.context)(cut);

  expect(gaps).toStrictEqual({ sinceYourLastTurn: '11 min', sinceOwnerLastWrote: '11 min' });
});
