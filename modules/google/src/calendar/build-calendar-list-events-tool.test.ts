import { expect, test } from 'bun:test';
import { startGmailTools } from '../test-utils/start-gmail-tools';

async function setupTest() {
  const ctx = await startGmailTools();

  const tool = ctx.findAction('calendar.list_events').tool;

  return {
    ...ctx,
    week: { from: '2026-11-14T00:00:00+11:00', to: '2026-11-21T00:00:00+11:00' },
    runList: (input: Record<string, string | number>) =>
      tool.run(
        {
          callID: 'call-1',
          tool: 'calendar.list_events',
          input: { connection: 'k3x9m2p7qa', ...input },
          toolUseID: null,
        },
        ctx.buildContext(),
      ),
  };
}

test('it lists the events of a week with sealed words and plain endorsed fields', async () => {
  const ctx = await setupTest();

  const seeded = ctx.site.calendar.seed({
    title: 'Dentist',
    start: '2026-11-15T09:30:00+11:00',
    end: '2026-11-15T10:15:00+11:00',
    location: '12 High St',
    guests: [{ email: 'Sam@Example.org', response: 'accepted' }],
  });

  const outcome = await ctx.runList(ctx.week);

  expect(outcome).toMatchObject({
    status: 'ok',
    result: {
      events: [
        {
          event: `k3x9m2p7qa.${seeded.id}`,
          title: expect.stringContaining('<tool-result source="untrusted"'),
          start: '2026-11-15T09:30:00+11:00',
          end: '2026-11-15T10:15:00+11:00',
          isAllDay: false,
          location: expect.stringContaining('<tool-result source="untrusted"'),
          organizer: expect.stringContaining('me@example.test'),
          guests: [expect.stringContaining('sam@example.org')],
          yourResponse: 'accepted',
          status: 'confirmed',
        },
      ],
      next: null,
    },
    record: { events: [{ title: 'Dentist', location: '12 High St', guests: ['sam@example.org'] }] },
  });
});

test('it counts the organizer as a guest but never the account itself', async () => {
  const ctx = await setupTest();

  ctx.site.calendar.seed({
    title: 'Review',
    start: '2026-11-16T09:00:00+11:00',
    end: '2026-11-16T10:00:00+11:00',
    organizer: 'boss@example.org',
    guests: [{ email: 'me@example.test' }],
    yourResponse: 'tentative',
  });

  const outcome = await ctx.runList(ctx.week);

  expect(outcome).toMatchObject({
    status: 'ok',
    record: {
      events: [
        { guests: ['boss@example.org'], organizer: 'boss@example.org', yourResponse: 'tentative' },
      ],
    },
  });
});

test('it lists an all-day event with its date and the flag', async () => {
  const ctx = await setupTest();

  ctx.site.calendar.seed({ title: 'Holiday', start: '2026-11-16', end: '2026-11-17' });

  const outcome = await ctx.runList(ctx.week);

  expect(outcome).toMatchObject({
    status: 'ok',
    result: { events: [{ start: '2026-11-16', end: '2026-11-17', isAllDay: true }] },
  });
});

test('it passes the token of the next page back as after', async () => {
  const ctx = await setupTest();

  ctx.site.calendar.seed({
    title: 'One',
    start: '2026-11-15T09:00:00+11:00',
    end: '2026-11-15T10:00:00+11:00',
  });

  ctx.site.calendar.seed({
    title: 'Two',
    start: '2026-11-16T09:00:00+11:00',
    end: '2026-11-16T10:00:00+11:00',
  });

  const first = await ctx.runList({ ...ctx.week, limit: 1 });

  const next = first.status === 'ok' ? first.result['next'] : null;

  expect(next).toBe('k3x9m2p7qa.1');

  const second = await ctx.runList({
    ...ctx.week,
    limit: 1,
    after: typeof next === 'string' ? next : '',
  });

  expect(second).toMatchObject({
    status: 'ok',
    record: { events: [{ title: 'Two' }], next: null },
  });
});

test('it reads the calendar the call names, and primary by default', async () => {
  const ctx = await setupTest();

  ctx.site.calendar.seed({
    calendar: 'team@group.calendar.google.com',
    title: 'Standup',
    start: '2026-11-16T09:00:00+11:00',
    end: '2026-11-16T09:15:00+11:00',
  });

  const primary = await ctx.runList(ctx.week);
  const team = await ctx.runList({ ...ctx.week, calendar: 'team@group.calendar.google.com' });

  expect([primary, team]).toMatchObject([
    { status: 'ok', result: { events: [] } },
    {
      status: 'ok',
      result: {
        events: [{ event: expect.stringMatching(/@team@group\.calendar\.google\.com$/u) }],
      },
    },
  ]);
});

test('it refuses a time with no offset', async () => {
  const ctx = await setupTest();
  const outcome = await ctx.runList({ from: '2026-11-14T00:00:00', to: ctx.week.to });

  expect(outcome.status).toBe('error');
});

test('it refuses an answer from Google that is an error', async () => {
  const ctx = await setupTest();

  ctx.site.calendar.failures.push({
    line: 'GET /calendar/v3/calendars/primary/events',
    status: 500,
  });

  const outcome = await ctx.runList(ctx.week);

  expect(outcome).toMatchObject({
    status: 'error',
    failure: { code: 'failed', status: 500, detail: 'Google answered backendError' },
  });
});

test('it fails a list that Google answers with text that is no JSON', async () => {
  const ctx = await setupTest();

  ctx.site.calendar.failures.push({
    line: 'GET /calendar/v3/calendars/primary/events',
    status: 200,
    body: '<html>oops',
  });

  const outcome = await ctx.runList(ctx.week);

  expect(outcome).toMatchObject({ status: 'error', failure: { code: 'failed' } });
});

test('it reads the retry time of a rate limit that Google gives as an HTTP date', async () => {
  const ctx = await setupTest();

  ctx.site.calendar.failures.push({
    line: 'GET /calendar/v3/calendars/primary/events',
    status: 403,
    body: '{"error":{"errors":[{"reason":"userRateLimitExceeded"}]}}',
    headers: {
      date: 'Mon, 23 Nov 2026 09:00:00 GMT',
      'retry-after': 'Mon, 23 Nov 2026 09:00:12 GMT',
    },
  });

  const outcome = await ctx.runList(ctx.week);

  expect(outcome).toMatchObject({
    status: 'error',
    failure: { code: 'rate_limited', status: 403, retryAfterMs: 12_000 },
  });
});

test('it treats a refusal whose message names a rate limit as a refusal', async () => {
  const ctx = await setupTest();

  ctx.site.calendar.failures.push({
    line: 'GET /calendar/v3/calendars/primary/events',
    status: 403,
    body: '{"error":{"message":"userRateLimitExceeded","errors":[{"reason":"forbidden"}]}}',
  });

  const outcome = await ctx.runList(ctx.week);

  expect(outcome).toMatchObject({ status: 'error', failure: { code: 'refused' } });
});

test('it ends a call that names a connection that is gone as connection_unavailable', async () => {
  const ctx = await setupTest();

  const resolved = await ctx
    .findAction('calendar.list_events')
    .tool.resolveInput?.({ ...ctx.week, connection: 'gone' }, ctx.buildContext());

  expect(resolved).toStrictEqual({
    status: 'error',
    message: '{"origin":"nixie","kind":"connection_unavailable"}',
    failure: { code: 'connection_unavailable' },
  });
});
