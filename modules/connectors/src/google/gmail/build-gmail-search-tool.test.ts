import { expect, test } from 'bun:test';
import { startGmailTools } from '../../test-utils/start-gmail-tools';

async function setupTest() {
  const ctx = await startGmailTools();

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

  const second = await ctx.runSearch({ query: 'note', limit: 1, after: String(next) });

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
    message: 'GMAIL_FAILED: Gmail answered insufficientPermissions',
  });
});

test('it ends the search with an error when a listed hit fails to read', async () => {
  const ctx = await setupTest();

  const seeded = ctx.site.gmail.seed({ from: 'sam@example.org', subject: 'Q3', text: 'figures' });

  ctx.site.gmail.failures.push({ line: `GET /messages/${seeded.id}`, status: 500 });

  const outcome = await ctx.runSearch({ query: 'figures' });

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'GMAIL_FAILED: Gmail answered backendError',
  });
});

test('it ends the search with an error when Gmail answers a list it cannot read', async () => {
  const ctx = await setupTest();

  ctx.site.gmail.failures.push({ line: 'GET /messages?', status: 200, body: '{"messages":"x"}' });

  const outcome = await ctx.runSearch({ query: 'figures' });

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'GMAIL_FAILED: Gmail answered with no list of messages',
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
