import { expect, test } from 'bun:test';
import { kagiAPIURL } from './kagi-api-url';
import { kagiStore } from './kagi-store';

test("it answers a request with an unknown key with 401 and the error envelope of Kagi's spec", async () => {
  await kagiStore.keys.create({ key: 'kagi-key-a' });

  const response = await fetch(`${kagiAPIURL}/search`, {
    method: 'POST',
    headers: { authorization: 'Bearer kagi-key-b', 'content-type': 'application/json' },
    body: JSON.stringify({ query: 'tide times', workflow: 'search', limit: 10 }),
  });

  const body: unknown = await response.json();

  expect({ status: response.status, body }).toStrictEqual({
    status: 401,
    body: { error: [{ code: '2', message: 'Unauthorized' }] },
  });
});

test('it answers a request with no query with 400', async () => {
  await kagiStore.keys.create({ key: 'kagi-key-a' });

  const response = await fetch(`${kagiAPIURL}/search`, {
    method: 'POST',
    headers: { authorization: 'Bearer kagi-key-a', 'content-type': 'application/json' },
    body: JSON.stringify({ workflow: 'search', limit: 10 }),
  });

  expect(response.status).toBe(400);
});

test('it answers with at most the limit of the hits it holds for the exact query', async () => {
  await kagiStore.keys.create({ key: 'kagi-key-a' });
  await kagiStore.results.create({ query: 'tides', url: 'https://a.test/', title: 'A' });
  await kagiStore.results.create({ query: 'tides', url: 'https://b.test/', title: 'B' });
  await kagiStore.results.create({ query: 'ferries', url: 'https://c.test/', title: 'C' });

  const response = await fetch(`${kagiAPIURL}/search`, {
    method: 'POST',
    headers: { authorization: 'Bearer kagi-key-a', 'content-type': 'application/json' },
    body: JSON.stringify({ query: 'tides', workflow: 'search', limit: 1 }),
  });

  const body: unknown = await response.json();

  expect(body).toStrictEqual({ data: { search: [{ url: 'https://a.test/', title: 'A' }] } });
});
