import { expect, test } from 'bun:test';
import { runClockUntil } from '@zgeoff/testing/clock';
import { startGmailTools } from '../test-utils/start-gmail-tools';

async function setupTest() {
  const ctx = await startGmailTools({
    retry: { random: () => 0.5, maxAttempts: 2, budgetMs: 3_600_000 },
  });

  const tool = ctx.findAction('gmail.search').tool;

  return {
    ...ctx,
    runSearch: (input: Record<string, string | number>) =>
      tool.run(
        {
          callID: 'call-1',
          tool: 'gmail.search',
          input: { connection: 'k3x9m2p7qa', ...input },
          toolUseID: null,
        },
        ctx.buildContext(),
      ),
    callSearch: async (query: string) => {
      const results: Awaited<ReturnType<typeof ctx.callTool>>[] = [];

      void (async () => {
        const result = await ctx.callTool('gmail.search', { query });

        results.push(result);
      })();

      await runClockUntil(ctx.clock, () => results.length === 1, { maxMs: 3_600_000, stepMs: 500 });

      return results;
    },
    runAbortedSearch: (input: Record<string, string | number>) =>
      tool.run(
        {
          callID: 'call-1',
          tool: 'gmail.search',
          input: { connection: 'k3x9m2p7qa', ...input },
          toolUseID: null,
        },
        { ...ctx.buildContext(), signal: AbortSignal.abort() },
      ),
  };
}

test('it returns each hit with its IDs, outside content and endorsed fields', async () => {
  const ctx = await setupTest();

  const seeded = ctx.site.gmail.seed({
    from: 'Sam Lee <sam@example.org>',
    subject: 'Q3 numbers',
    text: 'Here are the figures',
    attachments: [{ name: 'q3.csv', type: 'text/csv', bytes: new Uint8Array(4) }],
  });

  const outcome = await ctx.runSearch({ query: 'figures' });

  expect(outcome).toMatchObject({
    status: 'ok',
    result: {
      messages: [
        {
          message: `k3x9m2p7qa.${seeded.id}`,
          thread: `k3x9m2p7qa.${seeded.id}`,
          from: expect.stringContaining('<tool-result source="untrusted"'),
          subject: expect.stringContaining('<tool-result source="untrusted"'),
          date: '2026-11-12T23:04:00.000Z',
          labels: ['INBOX', 'UNREAD'],
          isUnread: true,
          hasAttachments: true,
        },
      ],
      next: null,
    },
  });
});

test('it passes the token of the next page back as after', async () => {
  const ctx = await setupTest();

  ctx.site.gmail.seed({ from: 'a@example.org', subject: 'one', text: 'note', sentAtMs: 2000 });
  ctx.site.gmail.seed({ from: 'b@example.org', subject: 'two', text: 'note', sentAtMs: 1000 });

  const first = await ctx.runSearch({ query: 'note', limit: 1 });

  const next = first.status === 'ok' ? first.result['next'] : null;

  expect(next).toBe('k3x9m2p7qa.1');

  const second = await ctx.runSearch({
    query: 'note',
    limit: 1,
    after: typeof next === 'string' ? next : '',
  });

  expect(second).toMatchObject({
    status: 'ok',
    record: { messages: [{ subject: 'two' }], next: null },
  });
});

test('it refuses an answer from Gmail that is an error', async () => {
  const ctx = await setupTest();

  ctx.site.gmail.failures.push({
    line: 'GET /messages',
    status: 403,
    body: '{"error":{"errors":[{"reason":"insufficientPermissions"}]}}',
  });

  const outcome = await ctx.runSearch({ query: 'anything' });

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'Gmail answered insufficientPermissions',
    failure: { code: 'refused', status: 403, detail: 'Gmail answered insufficientPermissions' },
  });
});

test('it ends the search with an error when a listed hit fails to read', async () => {
  const ctx = await setupTest();

  const seeded = ctx.site.gmail.seed({ from: 'sam@example.org', subject: 'Q3', text: 'figures' });

  ctx.site.gmail.failures.push({ line: `GET /messages/${seeded.id}`, status: 500 });

  const outcome = await ctx.runSearch({ query: 'figures' });

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'Gmail answered backendError',
    failure: { code: 'failed', status: 500, detail: 'Gmail answered backendError' },
  });
});

test('it ends the search with an error when Gmail answers a list it cannot read', async () => {
  const ctx = await setupTest();

  ctx.site.gmail.failures.push({ line: 'GET /messages?', status: 200, body: '{"messages":"x"}' });

  const outcome = await ctx.runSearch({ query: 'figures' });

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'Gmail answered with no list of messages',
    failure: { code: 'failed', detail: 'Gmail answered with no list of messages' },
  });
});

test('it drops a hit that vanished between the list and its read', async () => {
  const ctx = await setupTest();

  const seeded = ctx.site.gmail.seed({ from: 'sam@example.org', subject: 'Q3', text: 'figures' });

  ctx.site.gmail.failures.push({ line: `GET /messages/${seeded.id}`, status: 404 });

  const outcome = await ctx.runSearch({ query: 'figures' });

  expect(outcome).toMatchObject({ status: 'ok', result: { messages: [], next: null } });
});

test('it marks the date, the unread flag and the attachment flag of a hit as endorsed', async () => {
  const ctx = await setupTest();

  const schema = ctx.findAction('gmail.search').tool.output;

  expect(schema).toMatchObject({
    properties: {
      messages: {
        items: {
          properties: {
            date: { 'x-endorsed': true },
            isUnread: { 'x-endorsed': true },
            hasAttachments: { 'x-endorsed': true },
          },
        },
      },
    },
  });
});

test('it reads a retry time that Gmail gives as an HTTP date from the date of its own answer', async () => {
  const ctx = await setupTest();

  ctx.site.gmail.failures.push({
    line: 'GET /messages?',
    status: 429,
    body: '{"error":{"errors":[{"reason":"rateLimitExceeded"}]}}',
    headers: {
      date: 'Mon, 23 Nov 2026 09:00:00 GMT',
      'retry-after': 'Mon, 23 Nov 2026 09:00:07 GMT',
    },
  });

  const outcome = await ctx.runSearch({ query: 'anything' });

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'Gmail answered rateLimitExceeded',
    failure: {
      code: 'rate_limited',
      status: 429,
      retryAfterMs: 7000,
      detail: 'Gmail answered rateLimitExceeded',
    },
  });
});

test('it keeps the retry time of a rate limit that a hit read returns', async () => {
  const ctx = await setupTest();

  const seeded = ctx.site.gmail.seed({ from: 'sam@example.org', subject: 'Q3', text: 'figures' });

  ctx.site.gmail.failures.push({
    line: `GET /messages/${seeded.id}`,
    status: 429,
    headers: { 'retry-after': '10' },
  });

  const outcome = await ctx.runSearch({ query: 'figures' });

  expect(outcome).toMatchObject({
    status: 'error',
    failure: { code: 'rate_limited', retryAfterMs: 10_000 },
  });
});

test('it treats a refusal whose message names a rate limit as a refusal', async () => {
  const ctx = await setupTest();

  ctx.site.gmail.failures.push({
    line: 'GET /messages?',
    status: 403,
    body: '{"error":{"message":"rateLimitExceeded is not why","errors":[{"reason":"insufficientPermissions"}]}}',
  });

  const outcome = await ctx.runSearch({ query: 'anything' });

  expect(outcome).toMatchObject({ status: 'error', failure: { code: 'refused', status: 403 } });
});

test('it ends the search with a failure when Gmail answers 200 with text that is no JSON', async () => {
  const ctx = await setupTest();

  ctx.site.gmail.failures.push({ line: 'GET /messages?', status: 200, body: '<html>oops' });

  const outcome = await ctx.runSearch({ query: 'figures' });

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'Gmail answered with no list of messages',
    failure: { code: 'failed', detail: 'Gmail answered with no list of messages' },
  });
});

test('it ends the search with a failure when Gmail answers 200 with an empty body', async () => {
  const ctx = await setupTest();

  ctx.site.gmail.failures.push({ line: 'GET /messages?', status: 200, body: '' });

  const outcome = await ctx.runSearch({ query: 'figures' });

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'Gmail answered with no list of messages',
    failure: { code: 'failed', detail: 'Gmail answered with no list of messages' },
  });
});

test('it sends no request once the call is aborted', async () => {
  const ctx = await setupTest();

  const run = ctx.runAbortedSearch({ query: 'figures' });

  await expect(run).rejects.toThrow();
});

test.each([
  'gmail.search',
  'gmail.read',
  'gmail.read_attachment',
  'calendar.list_calendars',
  'calendar.list_events',
  'calendar.read_event',
  'drive.search',
  'drive.read',
])('it makes the endpoint retry a call of %s', async (name) => {
  const ctx = await setupTest();

  expect(ctx.findAction(name).tool.reachesProvider).toBeTrue();
});

test('it tries a search again after a server error and returns the hits', async () => {
  const ctx = await setupTest();

  ctx.site.gmail.seed({ from: 'sam@example.org', subject: 'Q3', text: 'figures' });
  ctx.site.gmail.failures.push({ line: 'GET /messages?', status: 503 });

  const results = await ctx.callSearch('figures');

  expect(results).toMatchObject([
    {
      content: [],
      structuredContent: { messages: [{ message: 'k3x9m2p7qa.m0001' }], next: null },
    },
  ]);
});

test('it stops after the attempts that the retry settings give, and tells the model the failure', async () => {
  const ctx = await setupTest();

  ctx.site.gmail.failures.push(
    { line: 'GET /messages?', status: 503 },
    { line: 'GET /messages?', status: 503 },
    { line: 'GET /messages?', status: 503 },
  );

  const results = await ctx.callSearch('figures');

  expect({ results, left: ctx.site.gmail.failures.length }).toStrictEqual({
    results: [
      {
        isError: true,
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              origin: 'provider',
              kind: 'failed',
              status: 503,
              detail: 'Gmail answered backendError',
            }),
          },
        ],
      },
    ],
    left: 1,
  });
});
