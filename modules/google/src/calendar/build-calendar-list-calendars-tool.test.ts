import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { startGmailTools } from '../test-utils/start-gmail-tools';

async function setupTest() {
  const ctx = await startGmailTools();

  const tool = ctx.findAction('calendar.list_calendars').tool;

  return {
    ...ctx,
    runList: (input: Record<string, string | null> = {}) =>
      tool.run(
        {
          callID: 'call-1',
          tool: 'calendar.list_calendars',
          input: { connection: 'k3x9m2p7qa', ...input },
          toolUseID: null,
        },
        ctx.buildContext(),
      ),
  };
}

test('it hands back the next page of calendars and takes it as `after`', async () => {
  const ctx = await setupTest();

  ctx.site.calendar.listPageSize = 1;

  ctx.site.calendar.calendars.push({
    id: 'team@group.calendar.google.com',
    summary: 'Team',
    accessRole: 'reader',
  });

  const first = await ctx.runList();

  invariant(first.status === 'ok', 'the first page lists');

  const next = first.result['next'];

  invariant(typeof next === 'string', 'the first page names a next one');

  const second = await ctx.runList({ after: next });

  expect([next, second]).toMatchObject([
    'k3x9m2p7qa.1',
    {
      status: 'ok',
      result: {
        calendars: [{ calendar: 'team@group.calendar.google.com' }],
        next: null,
      },
    },
  ]);
});

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
