import { expect, mock, test } from 'bun:test';
import { CredentialRefusalError } from '@heynixie/egress';
import { makeKeyedFetch } from '@heynixie/egress/test-utils';
import { network } from '@heynixie/mock-server';
import { HttpResponse, http } from 'msw';
import { buildKagiSearch } from './build-kagi-search';
import { kagiAPIURL } from './mocks/kagi-api-url';
import { kagiStore } from './mocks/kagi-store';

function setupTest() {
  return {
    provider: buildKagiSearch({
      fetch: makeKeyedFetch('authorization', 'Bearer kagi-key-a'),
      apiURL: kagiAPIURL,
    }),
  };
}

test("it returns the hits Kagi holds for the query, each dated by the day of Kagi's time, at $0.012", async () => {
  const ctx = setupTest();

  await kagiStore.keys.create({ key: 'kagi-key-a' });

  await kagiStore.results.create({
    query: 'tide times',
    url: 'https://tides.test/shellharbour',
    title: 'Tide tables for Shellharbour',
    snippet: 'High tide at 06:12.',
    time: '2026-11-06T21:00:00Z',
  });

  await kagiStore.results.create({
    query: 'tide times',
    url: 'https://walks.test/harbour',
    title: 'Harbour walks',
  });

  const reply = await ctx.provider.readHits({
    query: 'tide times',
    limit: 10,
    sites: [],
    freshness: null,
  });

  expect(reply).toStrictEqual({
    kind: 'hits',
    hits: [
      {
        title: 'Tide tables for Shellharbour',
        url: 'https://tides.test/shellharbour',
        snippet: 'High tide at 06:12.',
        date: '2026-11-06',
      },
      {
        title: 'Harbour walks',
        url: 'https://walks.test/harbour',
        snippet: null,
        date: null,
      },
    ],
  });
});

test('it returns the title and the snippet of a hit as plain text, with no tags and no entities', async () => {
  const ctx = setupTest();

  await kagiStore.keys.create({ key: 'kagi-key-a' });

  await kagiStore.results.create({
    query: 'new dungeons list',
    url: 'https://game.test/dungeons',
    title: 'New <strong>Dungeons</strong> in the &#39;Frost&#39; patch',
    snippet: 'The <strong>dungeons</strong> list: Ember Hall &amp; the Sunken Keep&#39;s vault.',
  });

  const reply = await ctx.provider.readHits({
    query: 'new dungeons list',
    limit: 10,
    sites: [],
    freshness: null,
  });

  expect(reply).toStrictEqual({
    kind: 'hits',
    hits: [
      {
        title: "New Dungeons in the 'Frost' patch",
        url: 'https://game.test/dungeons',
        snippet: "The dungeons list: Ember Hall & the Sunken Keep's vault.",
        date: null,
      },
    ],
  });
});

test('it sends the sites as lens.sites_included and the freshness as lens.time_relative', async () => {
  const ctx = setupTest();
  const received = mock<(body: unknown) => void>();

  network.use(
    http.post(`${kagiAPIURL}/search`, async (info) => {
      const body: unknown = await info.request.clone().json();

      received(body);

      return HttpResponse.json({ data: { search: [] } });
    }),
  );

  await ctx.provider.readHits({
    query: 'ferry timetable',
    limit: 25,
    sites: ['ferries.test', 'transport.test'],
    freshness: 'week',
  });

  expect(received).toHaveBeenCalledExactlyOnceWith({
    query: 'ferry timetable',
    workflow: 'search',
    limit: 25,
    lens: { sites_included: ['ferries.test', 'transport.test'], time_relative: 'week' },
  });
});

test('it sends no lens for a search of any site at any time', async () => {
  const ctx = setupTest();
  const received = mock<(body: unknown) => void>();

  network.use(
    http.post(`${kagiAPIURL}/search`, async (info) => {
      const body: unknown = await info.request.clone().json();

      received(body);

      return HttpResponse.json({ data: { search: [] } });
    }),
  );

  await ctx.provider.readHits({ query: 'tide times', limit: 10, sites: [], freshness: null });

  expect(received).toHaveBeenCalledExactlyOnceWith({
    query: 'tide times',
    workflow: 'search',
    limit: 10,
  });
});

test('it returns only the hits from the sites the search names', async () => {
  const ctx = setupTest();

  await kagiStore.keys.create({ key: 'kagi-key-a' });

  await kagiStore.results.create({
    query: 'ferry timetable',
    url: 'https://ferries.test/manly',
    title: 'Manly ferry',
  });

  await kagiStore.results.create({
    query: 'ferry timetable',
    url: 'https://blog.test/ferries',
    title: 'My ferry blog',
  });

  const reply = await ctx.provider.readHits({
    query: 'ferry timetable',
    limit: 10,
    sites: ['ferries.test'],
    freshness: null,
  });

  expect(reply).toStrictEqual({
    kind: 'hits',
    hits: [{ title: 'Manly ferry', url: 'https://ferries.test/manly', snippet: null, date: null }],
  });
});

test('it returns only the hits published within the freshness the search sets', async () => {
  const ctx = setupTest();

  await kagiStore.keys.create({ key: 'kagi-key-a' });

  const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString();
  const twoWeeksAgo = new Date(Date.now() - 14 * 86_400_000).toISOString();

  await kagiStore.results.create({
    query: 'road closures',
    url: 'https://roads.test/this-week',
    title: 'Closures this week',
    time: twoDaysAgo,
  });

  await kagiStore.results.create({
    query: 'road closures',
    url: 'https://roads.test/last-month',
    title: 'Closures last month',
    time: twoWeeksAgo,
  });

  const reply = await ctx.provider.readHits({
    query: 'road closures',
    limit: 10,
    sites: [],
    freshness: 'week',
  });

  expect(reply).toStrictEqual({
    kind: 'hits',
    hits: [
      {
        title: 'Closures this week',
        url: 'https://roads.test/this-week',
        snippet: null,
        date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/u),
      },
    ],
  });
});

test("it fails with Kagi's error, which never quotes the key, when Kagi refuses the key", async () => {
  const ctx = setupTest();

  await kagiStore.keys.create({ key: 'kagi-key-b' });

  const reply = await ctx.provider.readHits({
    query: 'tide times',
    limit: 10,
    sites: [],
    freshness: null,
  });

  expect(reply).toStrictEqual({
    kind: 'failed',
    failure: { code: 'refused', status: 401, detail: 'Unauthorized' },
  });
});

test('it fails with the status when Kagi answers with an error it does not describe', async () => {
  const ctx = setupTest();

  network.use(
    http.post(`${kagiAPIURL}/search`, () => new HttpResponse('upstream down', { status: 503 })),
  );

  const reply = await ctx.provider.readHits({
    query: 'tide times',
    limit: 10,
    sites: [],
    freshness: null,
  });

  expect(reply).toStrictEqual({
    kind: 'failed',
    failure: { code: 'failed', status: 503, detail: 'no error detail' },
  });
});

test('it fails when Kagi answers 200 with a body that holds no results', async () => {
  const ctx = setupTest();

  network.use(http.post(`${kagiAPIURL}/search`, () => HttpResponse.json({ data: null })));

  const reply = await ctx.provider.readHits({
    query: 'tide times',
    limit: 10,
    sites: [],
    freshness: null,
  });

  expect(reply).toStrictEqual({
    kind: 'failed',
    failure: { code: 'failed', detail: 'Kagi answered with results nixie cannot read' },
  });
});

test('it fails when Kagi cannot be reached', async () => {
  const ctx = setupTest();

  network.use(http.post(`${kagiAPIURL}/search`, () => HttpResponse.error()));

  const reply = await ctx.provider.readHits({
    query: 'tide times',
    limit: 10,
    sites: [],
    freshness: null,
  });

  expect(reply).toStrictEqual({ kind: 'failed', failure: { code: 'no_answer' } });
});

test('it fails as rate limited with the time Kagi gives when Kagi answers 429', async () => {
  const ctx = setupTest();

  network.use(
    http.post(
      `${kagiAPIURL}/search`,
      () => new HttpResponse('slow down', { status: 429, headers: { 'retry-after': '7' } }),
    ),
  );

  const reply = await ctx.provider.readHits({
    query: 'tide times',
    limit: 10,
    sites: [],
    freshness: null,
  });

  expect(reply).toStrictEqual({
    kind: 'failed',
    failure: { code: 'rate_limited', status: 429, retryAfterMs: 7000, detail: 'no error detail' },
  });
});

test('it reads a retry time that Kagi gives as an HTTP date from the date of its own answer', async () => {
  const ctx = setupTest();

  network.use(
    http.post(
      `${kagiAPIURL}/search`,
      () =>
        new HttpResponse('slow down', {
          status: 429,
          headers: {
            date: 'Mon, 23 Nov 2026 09:00:00 GMT',
            'retry-after': 'Mon, 23 Nov 2026 09:00:09 GMT',
          },
        }),
    ),
  );

  const reply = await ctx.provider.readHits({
    query: 'tide times',
    limit: 10,
    sites: [],
    freshness: null,
  });

  expect(reply).toStrictEqual({
    kind: 'failed',
    failure: { code: 'rate_limited', status: 429, retryAfterMs: 9000, detail: 'no error detail' },
  });
});

test('it keeps a retry time that no date can hold within a day', async () => {
  const ctx = setupTest();

  network.use(
    http.post(
      `${kagiAPIURL}/search`,
      () =>
        new HttpResponse('slow down', { status: 429, headers: { 'retry-after': '9999999999999' } }),
    ),
  );

  const reply = await ctx.provider.readHits({
    query: 'tide times',
    limit: 10,
    sites: [],
    freshness: null,
  });

  expect(reply).toStrictEqual({
    kind: 'failed',
    failure: {
      code: 'rate_limited',
      status: 429,
      retryAfterMs: 86_400_000,
      detail: 'no error detail',
    },
  });
});

test('it aborts the request of Kagi when the call is aborted', async () => {
  const ctx = setupTest();

  await kagiStore.keys.create({ key: 'kagi-key-a' });

  const reply = ctx.provider.readHits(
    { query: 'tide times', limit: 10, sites: [], freshness: null },
    AbortSignal.abort(),
  );

  await expect(reply).resolves.toStrictEqual({ kind: 'failed', failure: { code: 'no_answer' } });
});

test('it throws a refusal of the fetcher, so the call fails with an error and no reply', () => {
  const refusal = new CredentialRefusalError('the request sets the cookie header');

  const refuse = () => Promise.reject(refusal);

  const provider = buildKagiSearch({
    fetch: refuse,
    apiURL: kagiAPIURL,
  });

  expect(
    provider.readHits({ query: 'tide times', limit: 10, sites: [], freshness: null }),
  ).rejects.toBe(refusal);
});
