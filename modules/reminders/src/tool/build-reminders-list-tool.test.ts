import { expect, test } from 'bun:test';
import { withWriteTransaction } from '@heynixie/log';
import { buildMockToolContext } from '@heynixie/tools/test-utils';
import { z } from 'zod';
import { writeReminderSet } from '../reminder/write-reminder-set';
import { buildReminderToolCall, startTestReminders } from '../test-utils';
import { buildRemindersListTool } from './build-reminders-list-tool';

async function setupTest() {
  const ctx = await startTestReminders();

  const list = buildRemindersListTool(ctx.reminders);

  return {
    ...ctx,
    addReminders: (count: number) =>
      withWriteTransaction(ctx.writer, async (tx) => {
        for (let index = 0; index < count; index += 1) {
          await writeReminderSet(tx, ctx.reminders, {
            name: `Reminder ${index}`,
            note: `Note ${index} ${'x'.repeat(400)}`,
            trigger: { at: '2027-03-10T08:00:00Z' },
            origin: 'conversation',
          });
        }
      }),
    runList: (input: object = {}) =>
      list.run(buildReminderToolCall('reminders.list', input), buildMockToolContext()),
  };
}

test('#reminders.list lists a reminder with its ID, words, state and next fire', async () => {
  const ctx = await setupTest();

  await ctx.addReminders(1);

  const outcome = await ctx.runList();

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      reminders: [
        {
          reminder: expect.any(String),
          name: 'Reminder 0',
          note: expect.stringContaining('Note 0'),
          trigger: 'once on Wed 10 Mar at 08:00',
          state: 'active',
          next: '2027-03-10T08:00:00.000Z',
          recentFires: [],
        },
      ],
    },
  });
});

test('#reminders.list pages over 200 reminders and lists each once, the newest set first', async () => {
  const ctx = await setupTest();

  await ctx.addReminders(200);

  const names: string[] = [];
  let cursor: string | undefined;
  let pages = 0;

  do {
    const outcome = await ctx.runList({ cursor });

    if (outcome.status !== 'ok') {
      throw new Error('the list failed');
    }

    const page = z.array(z.looseObject({ name: z.string() })).parse(outcome.result['reminders']);
    const next = z.string().optional().parse(outcome.result['nextCursor']);

    names.push(...page.map((entry) => entry.name));

    cursor = next;
    pages += 1;
  } while (cursor !== undefined);

  expect(pages).toBeGreaterThan(1);
  expect(names).toStrictEqual(Array.from({ length: 200 }, (_, index) => `Reminder ${199 - index}`));
});

test('#reminders.list refuses a cursor it did not give', async () => {
  const ctx = await setupTest();
  const outcome = await ctx.runList({ cursor: 'junk' });

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'that cursor is not one reminders.list gave; call reminders.list again with no cursor',
  });
});
