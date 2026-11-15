import { expect, test } from 'bun:test';
import { clientHeaderName, sessionCookieName } from '@heynixie/contract';
import { readRecords } from '@heynixie/log';
import { createConversationTask } from '@heynixie/tasks';
import { buildTestClient } from '../test-utils/build-test-client';
import { createDeviceSession } from '../test-utils/create-device-session';
import { startTestAPI } from '../test-utils/start-test-api';
import { defaultAPISettings } from '../utils/default-api-settings';
import { deriveSecretHash } from '../utils/derive-secret-hash';

async function setupTest() {
  const readOnlyToken = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');

  const api = await startTestAPI({
    ...defaultAPISettings,
    readOnlyTokenHashes: [deriveSecretHash(readOnlyToken)],
  });

  return { ...api, readOnlyToken };
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
  const before = await readRecords(ctx.context.log, { afterSequence: 0 });

  await fetch(`${ctx.url}/rpc/sessions/list`, {
    method: 'POST',
    headers: { authorization: 'Bearer a-token-nixie-never-issued' },
    body: '{}',
  });

  const after = await readRecords(ctx.context.log, { afterSequence: 0 });

  expect(after.map((read) => read.record.kind)).toStrictEqual(
    before.map((read) => read.record.kind),
  );
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

  const response = await fetch(`${ctx.url}/rpc/weather/forecast`, {
    method: 'POST',
    headers: { [clientHeaderName]: 'web', 'content-type': 'application/json' },
    body: '{}',
  });

  expect(response.status).toBe(404);
});

test('it answers conversation.read for a read-only token', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const client = buildTestClient(ctx.url, ctx.readOnlyToken);

  const page = await client.conversation.read({ thread: 'conversation' });

  expect(page.records.map((record) => record.kind)).toStrictEqual(['task.created']);
});

test('it answers tasks.list for a read-only token', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const client = buildTestClient(ctx.url, ctx.readOnlyToken);

  const listed = await client.tasks.list();

  expect(listed.tasks.map((task) => task.taskID)).toStrictEqual(['conversation']);
});

test.each([
  ['/rpc/conversation/send'],
  ['/rpc/sessions/list'],
  ['/rpc/sessions/issueCode'],
  ['/rpc/sessions/revoke'],
  ['/rpc/tasks/pause'],
  ['/rpc/records/follow'],
  ['/rpc/conversation/read/'],
  ['/rpc/weather/forecast'],
])('it refuses %s for a read-only token before any procedure runs', async (path) => {
  const ctx = await setupTest();

  const response = await fetch(`${ctx.url}${path}`, {
    method: 'POST',
    headers: {
      [clientHeaderName]: 'verify',
      'content-type': 'application/json',
      authorization: `Bearer ${ctx.readOnlyToken}`,
    },
    body: '{}',
  });

  expect(response.status).toBe(403);
});

test('it refuses a write for a read-only token sent as the session cookie', async () => {
  const ctx = await setupTest();

  const response = await fetch(`${ctx.url}/rpc/conversation/send`, {
    method: 'POST',
    headers: {
      [clientHeaderName]: 'web',
      'content-type': 'application/json',
      cookie: `${sessionCookieName}=${ctx.readOnlyToken}`,
    },
    body: '{}',
  });

  expect(response.status).toBe(403);
});

test('it writes no record for the calls of a read-only token', async () => {
  const ctx = await setupTest();
  const before = await readRecords(ctx.context.log, { afterSequence: 0 });

  const headers = {
    [clientHeaderName]: 'verify',
    'content-type': 'application/json',
    authorization: `Bearer ${ctx.readOnlyToken}`,
  };

  await fetch(`${ctx.url}/rpc/tasks/list`, { method: 'POST', headers, body: '{"json":{}}' });
  await fetch(`${ctx.url}/rpc/conversation/send`, { method: 'POST', headers, body: '{}' });

  const after = await readRecords(ctx.context.log, { afterSequence: 0 });

  expect(after.map((read) => read.record.kind)).toStrictEqual(
    before.map((read) => read.record.kind),
  );
});
