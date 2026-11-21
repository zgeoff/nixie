import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { buildMockToolContext } from '@heynixie/tools/test-utils';
import { readTestTriggerRows } from '@heynixie/triggers/test-utils';
import { reminderSetCodec } from '../record/reminder-set-codec';
import { reminderUpdatedCodec } from '../record/reminder-updated-codec';
import { readReminderByShortID } from '../reminder/read-reminder-by-short-id';
import { buildReminderToolCall, startTestReminders } from '../test-utils';
import { buildReminderSetTool } from './build-reminder-set-tool';
import { buildReminderSkipTool } from './build-reminder-skip-tool';

async function setupTest() {
  const ctx = await startTestReminders();

  const set = buildReminderSetTool(ctx.reminders);
  const skip = buildReminderSkipTool(ctx.reminders);

  return {
    ...ctx,
    runSet: async (input: object) => {
      const outcome = await set.run(
        buildReminderToolCall('reminder.set', input),
        buildMockToolContext(),
      );

      const reminder = outcome.status === 'ok' ? outcome.result['reminder'] : '';

      return typeof reminder === 'string' ? reminder : '';
    },
    runSkip: (input: object) =>
      skip.run(buildReminderToolCall('reminder.skip', input), buildMockToolContext()),
    readReminder: (reminder: string) => readReminderByShortID(ctx.writer.db, reminder),
    readVersionRecords: () =>
      readRecords(ctx.log, {
        afterSequence: 0,
        kinds: [reminderSetCodec.kind, reminderUpdatedCodec.kind],
      }),
    readDefinition: async () => {
      const rows = await readTestTriggerRows(ctx);

      return rows.definitions[0];
    },
  };
}

test('#reminder.skip drops the next fire and reads back the 3 after it', async () => {
  const ctx = await setupTest();

  const reminder = await ctx.runSet({
    name: 'Tomatoes',
    note: 'Water the tomatoes.',
    trigger: { schedule: { repeat: { frequency: 'weekly', byDay: ['fri'], at: ['08:00'] } } },
  });

  const outcome = await ctx.runSkip({ reminder });

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      reminder,
      skipped: '2027-03-12T08:00:00+00:00',
      rendered: 'every Friday at 08:00 (UTC)',
      next: ['2027-03-19T08:00:00+00:00', '2027-03-26T08:00:00+00:00', '2027-04-02T08:00:00+00:00'],
    },
  });
});

test('#reminder.skip moves the watermark and leaves the version of the reminder alone', async () => {
  const ctx = await setupTest();

  const reminder = await ctx.runSet({
    name: 'Tomatoes',
    note: 'Water the tomatoes.',
    trigger: { schedule: { repeat: { frequency: 'weekly', byDay: ['fri'], at: ['08:00'] } } },
  });

  const before = await ctx.readDefinition();
  const reminderBefore = await ctx.readReminder(reminder);
  const recordsBefore = await ctx.readVersionRecords();

  await ctx.runSkip({ reminder });

  const after = await ctx.readDefinition();
  const reminderAfter = await ctx.readReminder(reminder);
  const recordsAfter = await ctx.readVersionRecords();

  expect([after?.definition_hash, after?.after]).toStrictEqual([
    before?.definition_hash,
    Date.parse('2027-03-12T08:00:00Z'),
  ]);

  expect(reminderAfter).toStrictEqual(reminderBefore);
  expect(recordsAfter).toStrictEqual(recordsBefore);
});

test('#reminder.skip refuses a one-time reminder', async () => {
  const ctx = await setupTest();

  const reminder = await ctx.runSet({
    name: 'Dentist',
    note: 'Call the dentist.',
    trigger: { at: '2027-03-10T08:00:00Z' },
  });

  const outcome = await ctx.runSkip({ reminder });

  expect(outcome).toMatchObject({
    status: 'ok',
    result: { refused: { code: 'NOT_RECURRING', path: 'reminder' } },
    refusalCode: 'NOT_RECURRING',
  });
});

test('#reminder.skip refuses an unknown ID', async () => {
  const ctx = await setupTest();
  const outcome = await ctx.runSkip({ reminder: 'nope' });

  expect(outcome).toMatchObject({ result: { refused: { code: 'UNKNOWN_REMINDER' } } });
});
