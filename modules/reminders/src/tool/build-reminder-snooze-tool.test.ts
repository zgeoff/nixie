import { expect, test } from 'bun:test';
import { buildMockToolContext } from '@heynixie/tools/test-utils';
import { readTestTriggerRows } from '@heynixie/triggers/test-utils';
import { buildReminderToolCall, startTestReminders } from '../test-utils';
import { buildReminderSetTool } from './build-reminder-set-tool';
import { buildReminderSnoozeTool } from './build-reminder-snooze-tool';

async function setupTest() {
  const ctx = await startTestReminders();

  const set = buildReminderSetTool(ctx.reminders);
  const snooze = buildReminderSnoozeTool(ctx.reminders);

  return {
    ...ctx,
    runSet: async (input: object) => {
      const outcome = await set.run(
        buildReminderToolCall('reminder.set', input),
        buildMockToolContext(),
      );

      return outcome.status === 'ok' ? String(outcome.result['reminder']) : '';
    },
    runSnooze: (input: object) =>
      snooze.run(buildReminderToolCall('reminder.snooze', input), buildMockToolContext()),
    readDefinition: async () => {
      const rows = await readTestTriggerRows(ctx);

      return rows.definitions[0];
    },
  };
}

test('#reminder.snooze moves the next fire to the time and keeps the ones after it', async () => {
  const ctx = await setupTest();

  const reminder = await ctx.runSet({
    name: 'Tomatoes',
    note: 'Water the tomatoes.',
    trigger: { schedule: { repeat: { frequency: 'weekly', byDay: ['fri'], at: ['08:00'] } } },
  });

  const outcome = await ctx.runSnooze({ reminder, until: '2027-03-12T15:00:00Z' });

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      reminder,
      rendered: 'every Friday at 08:00 (UTC)',
      next: ['2027-03-12T15:00:00+00:00', '2027-03-19T08:00:00+00:00', '2027-03-26T08:00:00+00:00'],
    },
  });
});

test('#reminder.snooze holds one slot and leaves the version and the watermark alone', async () => {
  const ctx = await setupTest();

  const reminder = await ctx.runSet({
    name: 'Tomatoes',
    note: 'Water the tomatoes.',
    trigger: { schedule: { repeat: { frequency: 'weekly', byDay: ['fri'], at: ['08:00'] } } },
  });

  const before = await ctx.readDefinition();

  await ctx.runSnooze({ reminder, until: '2027-03-12T15:00:00Z' });

  const after = await ctx.readDefinition();

  expect([after?.definition_hash, after?.after, after?.hold_slot, after?.hold_until]).toStrictEqual(
    [
      before?.definition_hash,
      before?.after,
      Date.parse('2027-03-12T08:00:00Z'),
      Date.parse('2027-03-12T15:00:00Z'),
    ],
  );
});

test('#reminder.snooze reads a time with no offset in the owner zone', async () => {
  const ctx = await setupTest();

  const reminder = await ctx.runSet({
    name: 'Tomatoes',
    note: 'Water the tomatoes.',
    trigger: { schedule: { repeat: { frequency: 'weekly', byDay: ['fri'], at: ['08:00'] } } },
  });

  await ctx.runSnooze({ reminder, until: '2027-03-12T15:00:00' });

  const after = await ctx.readDefinition();

  expect(after?.hold_until).toBe(Date.parse('2027-03-12T15:00:00Z'));
});

test.each([
  ['a time that has passed', '2027-03-08T08:00:00Z', 'PAST'],
  ['a time at or before the fire', '2027-03-12T08:00:00Z', 'NOT_LATER'],
  ['a time at or after the fire that follows', '2027-03-19T08:00:00Z', 'TOO_FAR'],
])('#reminder.snooze refuses %s', async (_name, until, code) => {
  const ctx = await setupTest();

  const reminder = await ctx.runSet({
    name: 'Tomatoes',
    note: 'Water the tomatoes.',
    trigger: { schedule: { repeat: { frequency: 'weekly', byDay: ['fri'], at: ['08:00'] } } },
  });

  const outcome = await ctx.runSnooze({ reminder, until });

  expect(outcome).toMatchObject({
    status: 'ok',
    result: { refused: { code, path: 'until', sentence: expect.stringMatching(/\.$/u) } },
    refusalCode: code,
  });
});

test('#reminder.snooze refuses a one-time reminder', async () => {
  const ctx = await setupTest();

  const reminder = await ctx.runSet({
    name: 'Dentist',
    note: 'Call the dentist.',
    trigger: { at: '2027-03-10T08:00:00Z' },
  });

  const outcome = await ctx.runSnooze({ reminder, until: '2027-03-10T09:00:00Z' });

  expect(outcome).toMatchObject({ result: { refused: { code: 'NOT_RECURRING' } } });
});
