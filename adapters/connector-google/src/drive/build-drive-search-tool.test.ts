import { expect, test } from 'bun:test';
import { startGmailTools } from '../test-utils/start-gmail-tools';

async function setupTest() {
  const ctx = await startGmailTools();

  const tool = ctx.findAction('drive.search').tool;

  return {
    ...ctx,
    runSearch: (input: Record<string, string | number>) =>
      tool.run(
        {
          callID: 'call-1',
          tool: 'drive.search',
          input: { connection: 'k3x9m2p7qa', ...input },
          toolUseID: null,
        },
        ctx.buildContext(),
      ),
  };
}

test('it returns each file with its ID, a sealed name and endorsed fields', async () => {
  const ctx = await setupTest();

  const seeded = ctx.site.drive.seed({
    name: 'Trip plan',
    mimeType: 'application/vnd.google-apps.document',
    text: 'Flights and hotels',
  });

  const outcome = await ctx.runSearch({ query: 'plan' });

  expect(outcome).toMatchObject({
    status: 'ok',
    result: {
      files: [
        {
          file: `k3x9m2p7qa.${seeded.id}`,
          name: expect.stringContaining('<tool-result source="untrusted"'),
          type: 'google_doc',
          bytes: null,
          modifiedAt: '2026-11-20T09:01:00.000Z',
        },
      ],
      next: null,
      note: null,
    },
    record: { files: [{ name: 'Trip plan' }] },
  });
});

test('it finds a file by its content as well as its name', async () => {
  const ctx = await setupTest();

  ctx.site.drive.seed({ name: 'Notes', text: 'The hotel is booked' });

  const outcome = await ctx.runSearch({ query: 'hotel' });

  expect(outcome).toMatchObject({ status: 'ok', record: { files: [{ name: 'Notes' }] } });
});

test('it finds a file by the start of a word in its name', async () => {
  const ctx = await setupTest();

  ctx.site.drive.seed({ name: 'Itinerary', text: 'Flights and hotels' });

  const outcome = await ctx.runSearch({ query: 'itin' });

  expect(outcome).toMatchObject({ status: 'ok', record: { files: [{ name: 'Itinerary' }] } });
});

test('it finds a file by the start of its whole name, spaces included', async () => {
  const ctx = await setupTest();

  ctx.site.drive.seed({ name: 'Trip plan', text: 'Flights and hotels' });

  const outcome = await ctx.runSearch({ query: 'Trip pl' });

  expect(outcome).toMatchObject({ status: 'ok', record: { files: [{ name: 'Trip plan' }] } });
});

test('it finds no file whose name holds the query only inside a word', async () => {
  const ctx = await setupTest();

  ctx.site.drive.seed({ name: 'Subplanning', text: 'Flights and hotels' });

  const outcome = await ctx.runSearch({ query: 'plan' });

  expect(outcome).toMatchObject({ status: 'ok', result: { files: [] } });
});

test('it tells the model what it searched when it finds nothing', async () => {
  const ctx = await setupTest();
  const outcome = await ctx.runSearch({ query: 'budget' });

  expect(outcome).toMatchObject({
    status: 'ok',
    result: {
      files: [],
      note: expect.stringContaining(
        'only the files the owner picked for nixie and the files nixie made',
      ),
    },
  });
});

test('it escapes a quote in the query, so the text cannot widen the search', async () => {
  const ctx = await setupTest();

  await ctx.runSearch({ query: "x' or name contains '" });

  const request = decodeURIComponent(ctx.site.drive.requests[0] ?? '').replaceAll('+', ' ');

  expect(request).toContain(String.raw`name contains 'x\' or name contains \''`);
});

test('it leaves a trashed file out', async () => {
  const ctx = await setupTest();

  ctx.site.drive.seed({ name: 'Old plan', isTrashed: true });

  const outcome = await ctx.runSearch({ query: 'plan' });

  expect(outcome).toMatchObject({ status: 'ok', result: { files: [] } });
});

test('it passes the token of the next page back as after', async () => {
  const ctx = await setupTest();

  ctx.site.drive.seed({ name: 'Plan one', text: 'x' });
  ctx.site.drive.seed({ name: 'Plan two', text: 'x' });

  const first = await ctx.runSearch({ query: 'plan', limit: 1 });

  const next = first.status === 'ok' ? first.result['next'] : null;

  expect(next).toBe('k3x9m2p7qa.1');

  const second = await ctx.runSearch({
    query: 'plan',
    limit: 1,
    after: typeof next === 'string' ? next : '',
  });

  expect(second).toMatchObject({
    status: 'ok',
    record: { files: [{ name: 'Plan one' }], next: null },
  });
});

test('it refuses an answer from Google that is an error', async () => {
  const ctx = await setupTest();

  ctx.site.drive.failures.push({ line: 'GET /drive/v3/files', status: 500 });

  const outcome = await ctx.runSearch({ query: 'plan' });

  expect(outcome).toMatchObject({
    status: 'error',
    message: expect.stringContaining('GOOGLE_FAILED'),
  });
});
