import { expect, test } from 'bun:test';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { startBuiltWeb, startStubAPI, store } from '@heynixie/web/test-utils';
import { readWebBuild } from '../test-utils/read-web-build';

async function setupTest() {
  const serverPath = await readWebBuild();

  const api = startStubAPI();

  const web = await startBuiltWeb(api.url, serverPath);

  return { api, serverPath, url: web.url };
}

test('it renders the conversation with the device session from the browser cookie', async () => {
  const ctx = await setupTest();
  const session = await store.sessions.create({});

  await store.records.create({ kind: 'owner_message', message: { text: 'Is it raining?' } });

  const response = await fetch(`${ctx.url}/`, {
    headers: { cookie: `nixie_session=${session.token}` },
  });

  const html = await response.text();

  expect(html).toInclude('Is it raining?');
});

test('it forwards the device session to the API as a bearer token and never as a cookie', async () => {
  const ctx = await setupTest();
  const session = await store.sessions.create({});

  await fetch(`${ctx.url}/`, { headers: { cookie: `nixie_session=${session.token}` } });

  expect(ctx.api.requests).toStrictEqual([
    {
      authorization: `Bearer ${session.token}`,
      cookie: null,
      path: '/rpc/conversation/read',
    },
  ]);
});

test('it sets no cookie of its own', async () => {
  const ctx = await setupTest();
  const session = await store.sessions.create({});

  const response = await fetch(`${ctx.url}/`, {
    headers: { cookie: `nixie_session=${session.token}` },
  });

  expect(response.headers.getSetCookie()).toStrictEqual([]);
});

test('it keeps no session from one request to the next', async () => {
  const ctx = await setupTest();
  const session = await store.sessions.create({});

  await fetch(`${ctx.url}/`, { headers: { cookie: `nixie_session=${session.token}` } });
  await fetch(`${ctx.url}/`);

  expect(ctx.api.requests.at(-1)).toStrictEqual({
    authorization: null,
    cookie: null,
    path: '/rpc/conversation/read',
  });
});

test('it leaves a refused session for the browser to check before it shows the enrolment form', async () => {
  const ctx = await setupTest();
  const session = await store.sessions.create({ revokedAt: new Date() });

  await store.records.create({ kind: 'owner_message', message: { text: 'Is it raining?' } });

  const response = await fetch(`${ctx.url}/`, {
    headers: { cookie: `nixie_session=${session.token}` },
  });

  const html = await response.text();

  expect(html).not.toInclude('Enrol this browser');
  expect(html).not.toInclude('Is it raining?');
});

test('it answers ready once it reaches the API', async () => {
  const ctx = await setupTest();
  const response = await fetch(`${ctx.url}/health/ready`);

  expect(response.status).toBe(200);
});

test('it ships no private URL or session handling to the browser', async () => {
  const ctx = await setupTest();

  const assetsDir = join(ctx.serverPath, '..', '..', 'client', 'assets');

  const names = await readdir(assetsDir);
  const files = await Promise.all(names.map((name) => Bun.file(join(assetsDir, name)).text()));

  const bundle = files.join('\n');

  expect(['NIXIE_API_URL', 'nixie_session', 'Bearer ', 'getCookie']).toSatisfyAll(
    (forbidden: string) => !bundle.includes(forbidden),
  );
});
