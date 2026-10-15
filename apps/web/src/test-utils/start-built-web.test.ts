import { expect, onTestFinished, test } from 'bun:test';
import { startBuiltWeb } from './start-built-web';
import { startStubAPI } from './start-stub-api';

test('it serves the built web client against the given API', async () => {
  const api = startStubAPI();

  const web = await startBuiltWeb(api.url);
  const response = await fetch(`${web.url}/health/ready`);

  expect(response.status).toBe(200);

  expect(api.requests).toStrictEqual([
    { authorization: null, cookie: null, path: '/rpc/sessions/list' },
  ]);
}, 120_000);

test('it stops the web server when the test finishes', async () => {
  const api = startStubAPI();

  const web = await startBuiltWeb(api.url);

  onTestFinished(async () => {
    const reached = await fetch(`${web.url}/health/live`).then(
      () => true,
      () => false,
    );

    expect(reached).toBeFalse();
  });
}, 120_000);
