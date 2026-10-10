import { expect, test } from 'bun:test';
import type { ContractClient } from '@heynixie/contract';
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import { runMockAPIRequest } from './run-mock-api-request';
import { store } from './store';

function setupTest() {
  return {
    // Builds a client that reaches the mock API with the headers a caller chooses.
    buildClient: (headers: Readonly<Record<string, string>>): ContractClient =>
      createORPCClient<ContractClient>(
        new RPCLink({
          fetch: (request) => runMockAPIRequest(request),
          headers,
          url: 'http://api.test/rpc',
        }),
      ),
  };
}

test('it refuses a call without the client header', async () => {
  const response = await runMockAPIRequest(
    new Request('http://api.test/rpc/sessions/list', { body: '{}', method: 'POST' }),
  );

  expect(response.status).toBe(403);
});

test('it takes the device session from a bearer token', async () => {
  const ctx = setupTest();
  const session = await store.sessions.create({ deviceName: 'phone' });
  const client = ctx.buildClient({
    authorization: `Bearer ${session.token}`,
    'x-nixie-client': 'web',
  });

  const listed = await client.sessions.list();

  expect(listed.sessions).toMatchObject([{ current: true, deviceName: 'phone' }]);
});

test('it takes the device session from the session cookie', async () => {
  const ctx = setupTest();
  const session = await store.sessions.create({ deviceName: 'laptop' });
  const client = ctx.buildClient({
    cookie: `theme=dark; nixie_session=${session.token}`,
    'x-nixie-client': 'web',
  });

  const listed = await client.sessions.list();

  expect(listed.sessions).toMatchObject([{ current: true, deviceName: 'laptop' }]);
});

test('it refuses a revoked session', async () => {
  const ctx = setupTest();
  const session = await store.sessions.create({ revokedAt: new Date() });
  const client = ctx.buildClient({
    authorization: `Bearer ${session.token}`,
    'x-nixie-client': 'web',
  });

  expect(client.sessions.list()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('it sets a host-only session cookie on a cookie enrolment', async () => {
  await store.enrolmentCodes.create({ code: 'k7p-2xq' });

  const response = await runMockAPIRequest(
    new Request('http://api.test/rpc/sessions/enrol', {
      body: JSON.stringify({
        json: {
          clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
          code: 'k7p-2xq',
          deviceName: 'laptop',
          tokenDelivery: 'cookie',
        },
      }),
      headers: { 'content-type': 'application/json', 'x-nixie-client': 'web' },
      method: 'POST',
    }),
  );
  const session = store.sessions.findFirst((query) => query.where({ deviceName: 'laptop' }));

  expect(response.headers.getSetCookie()).toStrictEqual([
    `nixie_session=${session?.token}; Path=/; HttpOnly; Secure; SameSite=Strict`,
  ]);
});

test('it refuses an enrolment code that another enrolment used', async () => {
  const ctx = setupTest();
  const client = ctx.buildClient({ 'x-nixie-client': 'web' });

  await store.enrolmentCodes.create({
    clientActionID: '0b9d6c1e-2f4a-4e7b-9c3d-8a5f1e2b7c64',
    code: 'k7p-2xq',
  });

  expect(
    client.sessions.enrol({
      clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
      code: 'k7p-2xq',
      deviceName: 'laptop',
      tokenDelivery: 'cookie',
    }),
  ).rejects.toMatchObject({ code: 'ENROLMENT_CODE_INVALID' });
});

test('it writes a message once per client message ID', async () => {
  const ctx = setupTest();
  const session = await store.sessions.create({});
  const client = ctx.buildClient({
    authorization: `Bearer ${session.token}`,
    'x-nixie-client': 'web',
  });
  const message = {
    clientMessageId: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    spans: [{ end: 5, source: 'typed' as const, start: 0 }],
    text: 'hello',
    thread: 'conversation',
  };

  await client.conversation.send(message);

  const retried = await client.conversation.send(message);

  expect(retried).toStrictEqual({ duplicate: true, sequence: 1 });
  expect(store.records.count()).toBe(1);
});

test('it refuses a client message ID reused for a different message', async () => {
  const ctx = setupTest();
  const session = await store.sessions.create({});
  const client = ctx.buildClient({
    authorization: `Bearer ${session.token}`,
    'x-nixie-client': 'web',
  });

  await client.conversation.send({
    clientMessageId: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    spans: [{ end: 5, source: 'typed', start: 0 }],
    text: 'hello',
    thread: 'conversation',
  });

  expect(
    client.conversation.send({
      clientMessageId: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
      spans: [{ end: 7, source: 'typed', start: 0 }],
      text: 'goodbye',
      thread: 'conversation',
    }),
  ).rejects.toMatchObject({ code: 'CLIENT_ACTION_ID_REUSED' });
});

test('it streams the records written after the sequence a client follows from', async () => {
  const ctx = setupTest();
  const session = await store.sessions.create({});
  const client = ctx.buildClient({
    authorization: `Bearer ${session.token}`,
    'x-nixie-client': 'web',
  });

  await store.records.create({ message: { text: 'already read' } });

  const events = await client.log.follow({ afterSequence: 1, thread: 'conversation' });

  await store.records.create({ kind: 'assistant_message', message: { text: 'new' } });

  const first = await events.next();

  await events.return();

  expect(first.value).toMatchObject({ record: { message: { text: 'new' }, sequence: 2 } });
});
