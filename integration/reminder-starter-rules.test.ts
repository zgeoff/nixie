import { expect, test } from 'bun:test';
import { buildPolicyCall, readStarterDecisionPoint } from '@heynixie/policy/test-utils';
import {
  buildReminderCancelTool,
  buildReminderSetTool,
  buildReminderSkipTool,
  buildReminderSnoozeTool,
  buildReminderUpdateTool,
  buildRemindersListTool,
} from '@heynixie/reminders';
import { startTestReminders } from '@heynixie/reminders/test-utils';

test.each([
  ['reminder.set', buildReminderSetTool],
  ['reminder.update', buildReminderUpdateTool],
  ['reminder.cancel', buildReminderCancelTool],
  ['reminder.snooze', buildReminderSnoozeTool],
  ['reminder.skip', buildReminderSkipTool],
  ['reminders.list', buildRemindersListTool],
])('it allows %s under the starter rules with no approval', async (name, build) => {
  const ctx = await startTestReminders();

  const tool = build(ctx.reminders);
  const decide = readStarterDecisionPoint(() => tool.declaration);

  const decided = await decide(
    buildPolicyCall({ tool: name, toolList: [name], context: 'conversation' }),
  );

  expect(decided.decision).toMatchObject({ outcome: 'allow' });
});
