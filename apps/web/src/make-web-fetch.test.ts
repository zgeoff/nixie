import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeWebFetch } from './make-web-fetch';
import { startStubAPI } from './test-utils/start-stub-api';

async function setupTest() {
  const clientDir = await mkdtemp(join(tmpdir(), 'nixie-web-client-'));

  onTestFinished(async () => {
    await rm(clientDir, { force: true, recursive: true });
  });
  await mkdir(join(clientDir, 'assets'));

  return { clientDir };
}

test('it answers live without calling the API or Start', async () => {
  const ctx = await setupTest();
  const startFetch = mock(() => new Response('start'));
  const webFetch = makeWebFetch({
    apiURL: 'http://127.0.0.1:9',
    clientDir: ctx.clientDir,
    startFetch,
  });

  const response = await webFetch(new Request('http://web.test/health/live'));
  const body: unknown = await response.json();

  expect(response.status).toBe(200);
  expect(body).toStrictEqual({ status: 'live' });
  expect(startFetch).not.toHaveBeenCalled();
});

test('it answers ready when the API answers', async () => {
  const ctx = await setupTest();
  const api = startStubAPI();
  const webFetch = makeWebFetch({
    apiURL: api.url,
    clientDir: ctx.clientDir,
    startFetch: () => new Response('start'),
  });

  const response = await webFetch(new Request('http://web.test/health/ready'));
  const body: unknown = await response.json();

  expect(response.status).toBe(200);
  expect(body).toStrictEqual({ status: 'ready' });
});

test('it probes the API with no credential', async () => {
  const ctx = await setupTest();
  const api = startStubAPI();
  const webFetch = makeWebFetch({
    apiURL: api.url,
    clientDir: ctx.clientDir,
    startFetch: () => new Response('start'),
  });

  await webFetch(
    new Request('http://web.test/health/ready', {
      headers: { authorization: 'Bearer probe-token', cookie: 'nixie_session=probe-token' },
    }),
  );

  expect(api.requests).toStrictEqual([
    { authorization: null, cookie: null, path: '/rpc/sessions/list' },
  ]);
});

test('it answers unready when the API does not answer', async () => {
  const ctx = await setupTest();
  const closed = Bun.serve({ fetch: () => new Response(), hostname: '127.0.0.1', port: 0 });
  const apiURL = `http://127.0.0.1:${closed.port}`;

  await closed.stop(true);

  const webFetch = makeWebFetch({
    apiURL,
    clientDir: ctx.clientDir,
    startFetch: () => new Response('start'),
  });

  const response = await webFetch(new Request('http://web.test/health/ready'));
  const body: unknown = await response.json();

  expect(response.status).toBe(503);
  expect(body).toStrictEqual({ status: 'unready', unready: ['api'] });
});

test('it serves a built browser asset', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.clientDir, 'assets', 'index-abc.js'), 'console.log("hi");');

  const webFetch = makeWebFetch({
    apiURL: 'http://127.0.0.1:9',
    clientDir: ctx.clientDir,
    startFetch: () => new Response('start'),
  });

  const response = await webFetch(new Request('http://web.test/assets/index-abc.js'));
  const body = await response.text();

  expect(body).toBe('console.log("hi");');
});

test('it never serves a file outside the browser assets', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.clientDir, 'secret.txt'), 'outside');

  const webFetch = makeWebFetch({
    apiURL: 'http://127.0.0.1:9',
    clientDir: ctx.clientDir,
    startFetch: () => new Response('start'),
  });

  const response = await webFetch(new Request('http://web.test/assets/%2e%2e/secret.txt'));
  const body = await response.text();

  expect(body).toBe('start');
});

test('it sends every other path to Start', async () => {
  const ctx = await setupTest();
  const startFetch = mock(() => new Response('start'));
  const webFetch = makeWebFetch({
    apiURL: 'http://127.0.0.1:9',
    clientDir: ctx.clientDir,
    startFetch,
  });

  const response = await webFetch(new Request('http://web.test/'));
  const body = await response.text();

  expect(body).toBe('start');
  expect(startFetch).toHaveBeenCalledOnce();
});
