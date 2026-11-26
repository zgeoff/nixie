import { expect, test } from 'bun:test';
import { startGmailTools } from '../../test-utils/start-gmail-tools';

async function setupTest() {
  const ctx = await startGmailTools();

  const tool = ctx.findAction('calendar.list_calendars').tool;

  return {
    ...ctx,
    runList: () =>
      tool.run(
        {
          callID: 'call-1',
          tool: 'calendar.list_calendars',
          input: { connection: 'k3x9m2p7qa' },
          toolUseID: null,
        },
        ctx.buildContext(),
      ),
  };
}

test('it lists each calendar with its ID, a sealed name and the access of the account', async () => {
  const ctx = await setupTest();

  ctx.site.calendar.calendars.push({
    id: 'team@group.calendar.google.com',
    summary: 'Team',
    accessRole: 'reader',
  });

  const outcome = await ctx.runList();

  expect(outcome).toMatchObject({
    status: 'ok',
    result: {
      calendars: [
        { calendar: 'me@example.test', isPrimary: true, access: 'owner' },
        {
          calendar: 'team@group.calendar.google.com',
          name: expect.stringContaining('<tool-result source="untrusted"'),
          isPrimary: false,
          access: 'reader',
        },
      ],
      next: null,
    },
    record: { calendars: [{ name: 'Personal' }, { name: 'Team' }] },
  });
});

test('it needs the scope of the calendar list, and the other Calendar tools do not', async () => {
  const ctx = await setupTest();

  const scopes = ctx.calendarActions.map((action) => [action.tool.name, action.scopes[0]]);

  expect(scopes.filter(([, scope]) => scope === 'calendar.calendarlist.readonly')).toStrictEqual([
    ['calendar.list_calendars', 'calendar.calendarlist.readonly'],
  ]);
});
