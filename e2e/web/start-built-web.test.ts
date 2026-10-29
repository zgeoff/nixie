import { expect, onTestFinished, test } from 'bun:test';
import { startBuiltWeb, startStubAPI } from '@heynixie/web/test-utils';
import { readWebBuild } from '../test-utils/read-web-build';

test('it serves the built web client against the given API', async () => {
  const serverPath = await readWebBuild();

  const api = startStubAPI();

  const web = await startBuiltWeb(api.url, serverPath);
  const response = await fetch(`${web.url}/health/ready`);

  expect(response.status).toBe(200);

  expect(api.requests).toStrictEqual([
    { authorization: null, cookie: null, path: '/rpc/sessions/list' },
  ]);
});

test('it stops the web server when the test finishes', async () => {
  const serverPath = await readWebBuild();

  const api = startStubAPI();

  const web = await startBuiltWeb(api.url, serverPath);

  onTestFinished(async () => {
    const reached = await fetch(`${web.url}/health/live`).then(
      () => true,
      () => false,
    );

    expect(reached).toBeFalse();
  });
});
