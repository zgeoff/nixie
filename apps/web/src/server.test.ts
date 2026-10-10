import { expect, onTestFinished, test } from 'bun:test';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { waitFor } from '@testing-library/react';
import { store } from './mocks/store';
import { buildWebOnce } from './test-utils/build-web-once';
import { startStubAPI } from './test-utils/start-stub-api';

// The first test in the process waits for the Vite build.
const timeout = 120_000;

async function setupTest() {
  const serverPath = await buildWebOnce();
  const api = startStubAPI();
  const portProbe = Bun.serve({ fetch: () => new Response(), hostname: '127.0.0.1', port: 0 });
  const port = portProbe.port;

  await portProbe.stop(true);

  const child = Bun.spawn(['bun', serverPath], {
    env: { ...process.env, NIXIE_API_URL: api.url, NODE_ENV: 'production', PORT: String(port) },
    stderr: 'inherit',
    stdout: 'ignore',
  });

  onTestFinished(async () => {
    child.kill();
    await child.exited;
  });

  const url = `http://127.0.0.1:${port}`;

  await waitFor(
    async () => {
      const live = await fetch(`${url}/health/live`);

      expect(live.status).toBe(200);
    },
    { timeout: 10_000 },
  );

  return { api, serverPath, url };
}

test(
  'it renders the conversation with the device session from the browser cookie',
  async () => {
    const ctx = await setupTest();
    const session = await store.sessions.create({});

    await store.records.create({ kind: 'owner_message', message: { text: 'Is it raining?' } });

    const response = await fetch(`${ctx.url}/`, {
      headers: { cookie: `nixie_session=${session.token}` },
    });

    const html = await response.text();

    expect(html).toInclude('Is it raining?');
  },
  timeout,
);

test(
  'it forwards the device session to the API as a bearer token and never as a cookie',
  async () => {
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
  },
  timeout,
);

test(
  'it sets no cookie of its own',
  async () => {
    const ctx = await setupTest();
    const session = await store.sessions.create({});

    const response = await fetch(`${ctx.url}/`, {
      headers: { cookie: `nixie_session=${session.token}` },
    });

    expect(response.headers.getSetCookie()).toStrictEqual([]);
  },
  timeout,
);

test(
  'it keeps no session from one request to the next',
  async () => {
    const ctx = await setupTest();
    const session = await store.sessions.create({});

    await fetch(`${ctx.url}/`, { headers: { cookie: `nixie_session=${session.token}` } });

    const response = await fetch(`${ctx.url}/`);

    const html = await response.text();

    expect(html).toInclude('Enrol this browser');
    expect(ctx.api.requests.at(-1)).toStrictEqual({
      authorization: null,
      cookie: null,
      path: '/rpc/conversation/read',
    });
  },
  timeout,
);

test(
  'it renders the enrolment form for a revoked session',
  async () => {
    const ctx = await setupTest();
    const session = await store.sessions.create({ revokedAt: new Date() });

    const response = await fetch(`${ctx.url}/`, {
      headers: { cookie: `nixie_session=${session.token}` },
    });

    const html = await response.text();

    expect(html).toInclude('Enrol this browser');
  },
  timeout,
);

test(
  'it answers ready once it reaches the API',
  async () => {
    const ctx = await setupTest();

    const response = await fetch(`${ctx.url}/health/ready`);

    expect(response.status).toBe(200);
  },
  timeout,
);

test(
  'it ships no private URL or session handling to the browser',
  async () => {
    const ctx = await setupTest();
    const assetsDir = join(ctx.serverPath, '..', '..', 'client', 'assets');
    const names = await readdir(assetsDir);
    const files = await Promise.all(names.map((name) => Bun.file(join(assetsDir, name)).text()));
    const bundle = files.join('\n');

    expect(['NIXIE_API_URL', 'nixie_session', 'Bearer ', 'getCookie']).toSatisfyAll(
      (forbidden: string) => !bundle.includes(forbidden),
    );
  },
  timeout,
);
