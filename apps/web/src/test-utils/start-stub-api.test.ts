import { expect, onTestFinished, test } from 'bun:test';
import { startStubAPI } from './start-stub-api';

test('it answers as the mock API on a loopback port', async () => {
  const api = startStubAPI();

  const response = await fetch(`${api.url}/rpc/sessions/list`, {
    body: '{}',
    headers: { 'content-type': 'application/json', 'x-nixie-client': 'web' },
    method: 'POST',
  });

  expect(response.status).toBe(401);
});

test('it records the credentials each request carried', async () => {
  const api = startStubAPI();

  await fetch(`${api.url}/rpc/sessions/list`, {
    body: '{}',
    headers: {
      authorization: 'Bearer t-1',
      'content-type': 'application/json',
      cookie: 'nixie_session=t-2',
      'x-nixie-client': 'web',
    },
    method: 'POST',
  });

  expect(api.requests).toStrictEqual([
    { authorization: 'Bearer t-1', cookie: 'nixie_session=t-2', path: '/rpc/sessions/list' },
  ]);
});

test('it stops the server when the test finishes', () => {
  const api = startStubAPI();

  onTestFinished(async () => {
    const reached = await fetch(`${api.url}/rpc/sessions/list`, { method: 'POST' }).then(
      () => true,
      () => false,
    );

    expect(reached).toBeFalse();
  });
});
