import { expect, onTestFinished, test } from 'bun:test';
import { startBuiltWeb, startStubAPI } from '@heynixie/web/test-utils';
import { resolveProgram } from '@zgeoff/rig/e2e';
import { start } from '@zgeoff/testing/process';

test('it serves the built web client against the given API', async () => {
  const program = await resolveProgram('web');

  const api = startStubAPI();

  await using web = await start(program.command, {
    cwd: program.cwd,
    env: { NIXIE_API_URL: api.url, NODE_ENV: 'production' },
    ready: { url: '/health/live' },
  });

  const response = await fetch(`${web.url}/health/ready`);

  expect(response.status).toBe(200);

  expect(api.requests).toStrictEqual([
    { authorization: null, cookie: null, path: '/rpc/sessions/list' },
  ]);
});

test('it stops the web server when the test finishes', async () => {
  const program = await resolveProgram('web');

  const serverPath = program.command.at(-1) ?? '';
  const api = startStubAPI();

  const web = await startBuiltWeb(api.url, serverPath);

  onTestFinished(async () => {
    const reached = await fetch(`${web.url}/health/live`)
      .then(() => true)
      .catch(() => false);

    expect(reached).toBeFalse();
  });
});
