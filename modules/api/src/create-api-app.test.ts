import { expect, test } from 'bun:test';
import { clientHeaderName, sessionCookieName } from '@heynixie/contract';
import { createDeviceSession } from './test-utils/create-device-session';
import { startTestAPI } from './test-utils/start-test-api';
import type { APITables } from './types';

async function setupTest() {
  const api = await startTestAPI();

  const db = api.writer.db.$extendTables<APITables & { records: { kind: string } }>();

  return { ...api, db };
}

test.each([
  ['/rpc/sessions/enrol'],
  ['/rpc/sessions/issueCode'],
  ['/rpc/sessions/list'],
  ['/rpc/sessions/revoke'],
  ['/rpc/conversation/read'],
  ['/rpc/conversation/send'],
  ['/rpc/log/follow'],
  ['/rpc/records/follow'],
])('it refuses %s without the client header, even with a live session', async (path) => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const response = await fetch(`${ctx.url}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${laptop.token}`,
      'content-type': 'application/json',
    },
    body: '{}',
  });

  expect(response.status).toBe(403);
});

test('it writes nothing for a call without the client header', async () => {
  const ctx = await setupTest();
  const before = await ctx.db.selectFrom('records').select('kind').execute();

  await fetch(`${ctx.url}/rpc/sessions/list`, {
    method: 'POST',
    headers: { authorization: 'Bearer a-token-nixie-never-issued' },
    body: '{}',
  });

  const after = await ctx.db.selectFrom('records').select('kind').execute();

  expect(after).toStrictEqual(before);
});

test('it takes the session from the cookie when no bearer token comes', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const response = await fetch(`${ctx.url}/rpc/sessions/list`, {
    method: 'POST',
    headers: {
      [clientHeaderName]: 'web',
      'content-type': 'application/json',
      cookie: `theme=dark; ${sessionCookieName}=${laptop.token}`,
    },
    body: '{}',
  });

  expect(response.status).toBe(200);
});

test('it takes the bearer token over the cookie', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const response = await fetch(`${ctx.url}/rpc/sessions/list`, {
    method: 'POST',
    headers: {
      [clientHeaderName]: 'web',
      'content-type': 'application/json',
      authorization: 'Bearer a-token-nixie-never-issued',
      cookie: `${sessionCookieName}=${laptop.token}`,
    },
    body: '{}',
  });

  expect(response.status).toBe(401);
});

test('it answers 404 for a path no procedure has', async () => {
  const ctx = await setupTest();

  const response = await fetch(`${ctx.url}/rpc/tasks/list`, {
    method: 'POST',
    headers: { [clientHeaderName]: 'web', 'content-type': 'application/json' },
    body: '{}',
  });

  expect(response.status).toBe(404);
});
