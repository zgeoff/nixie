import { expect, test } from 'bun:test';
import type { ContractClient } from '@heynixie/contract';
import { clientHeaderName, sessionCookieName } from '@heynixie/contract';
import { createORPCClient, isDefinedError, safe } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import { createEnrolmentCode } from './create-enrolment-code';
import { collectEvents } from './test-utils/collect-events';
import { createDeviceSession } from './test-utils/create-device-session';
import { startTestAPI } from './test-utils/start-test-api';
import type { APITables } from './types';

async function setupTest() {
  const api = await startTestAPI();
  const session = await createDeviceSession(api.context, 'laptop');
  const client = createORPCClient<ContractClient>(
    new RPCLink({
      url: `${api.url}/rpc`,
      headers: { [clientHeaderName]: 'test', authorization: `Bearer ${session.token}` },
    }),
  );
  const signedOut = createORPCClient<ContractClient>(
    new RPCLink({ url: `${api.url}/rpc`, headers: { [clientHeaderName]: 'test' } }),
  );
  const db = api.writer.db.$extendTables<APITables & { records: { kind: string } }>();

  return { ...api, session, client, signedOut, db };
}

test('#sessions.enrol sets a host-only HttpOnly Secure SameSite=Strict cookie on Path=/', async () => {
  const ctx = await setupTest();

  const issued = await createEnrolmentCode(ctx.context);
  const response = await fetch(`${ctx.url}/rpc/sessions/enrol`, {
    method: 'POST',
    headers: { [clientHeaderName]: 'web', 'content-type': 'application/json' },
    body: JSON.stringify({
      json: {
        clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
        code: issued.code,
        deviceName: 'browser',
        tokenDelivery: 'cookie',
      },
    }),
  });
  const cookie = response.headers.get('set-cookie') ?? '';

  expect(response.status).toBe(200);
  expect(cookie).toMatch(
    new RegExp(
      `^${sessionCookieName}=[\\w-]{43}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=34560000$`,
      'u',
    ),
  );
  expect(cookie).not.toInclude('Domain');
});

test('#sessions.enrol sends no cookie to a client that takes a bearer token', async () => {
  const ctx = await setupTest();

  const issued = await createEnrolmentCode(ctx.context);
  const enrolled = await ctx.signedOut.sessions.enrol({
    clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    code: issued.code,
    deviceName: 'phone',
    tokenDelivery: 'bearer',
  });

  expect(enrolled).toStrictEqual({ sessionID: expect.toBeString(), token: expect.toBeString() });
});

test('#sessions.enrol refuses a used code with a typed error', async () => {
  const ctx = await setupTest();

  const issued = await createEnrolmentCode(ctx.context);

  await ctx.signedOut.sessions.enrol({
    clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    code: issued.code,
    deviceName: 'phone',
    tokenDelivery: 'bearer',
  });

  const second = await safe(
    ctx.signedOut.sessions.enrol({
      clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
      code: issued.code,
      deviceName: 'tablet',
      tokenDelivery: 'bearer',
    }),
  );

  expect(second.isDefined).toBeTrue();
  expect(second.error).toMatchObject({ code: 'ENROLMENT_CODE_INVALID' });
});

test('#sessions.issueCode issues a code that enrols one more device', async () => {
  const ctx = await setupTest();

  const issued = await ctx.client.sessions.issueCode({
    clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
  });
  const enrolled = await ctx.signedOut.sessions.enrol({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    code: issued.code,
    deviceName: 'phone',
    tokenDelivery: 'bearer',
  });

  expect(issued.expiresAt).toStrictEqual(new Date(1_000_000 + 15 * 60 * 1000));
  expect(enrolled.sessionID).toBeString();
});

test('#sessions.issueCode answers a retry with a code that replaces the first', async () => {
  const ctx = await setupTest();

  const first = await ctx.client.sessions.issueCode({
    clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
  });
  const retry = await ctx.client.sessions.issueCode({
    clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
  });
  const enrolWithFirst = await safe(
    ctx.signedOut.sessions.enrol({
      clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
      code: first.code,
      deviceName: 'phone',
      tokenDelivery: 'bearer',
    }),
  );
  const codes = await ctx.db.selectFrom('enrolment_codes').select('used_at').execute();

  expect(retry.code).not.toBe(first.code);
  expect(retry.expiresAt).toStrictEqual(first.expiresAt);
  expect(enrolWithFirst.error).toMatchObject({ code: 'ENROLMENT_CODE_INVALID' });

  // the host code that enrolled the test's own device, and the one code of this action
  expect(codes).toHaveLength(2);
});

test('#sessions.list lists the live sessions and marks the caller', async () => {
  const ctx = await setupTest();

  const other = await createDeviceSession(ctx.context, 'phone');
  const listed = await ctx.client.sessions.list();

  expect(listed.sessions).toIncludeSameMembers([
    {
      createdAt: new Date(1_000_000),
      current: true,
      deviceName: 'laptop',
      lastUsedAt: new Date(1_000_000),
      sessionID: ctx.session.sessionID,
    },
    {
      createdAt: new Date(1_000_000),
      current: false,
      deviceName: 'phone',
      lastUsedAt: new Date(1_000_000),
      sessionID: other.sessionID,
    },
  ]);
});

test('#sessions.revoke refuses every later call from the revoked session', async () => {
  const ctx = await setupTest();

  const other = await createDeviceSession(ctx.context, 'phone');
  const phone = createORPCClient<ContractClient>(
    new RPCLink({
      url: `${ctx.url}/rpc`,
      headers: { [clientHeaderName]: 'test', authorization: `Bearer ${other.token}` },
    }),
  );

  await ctx.client.sessions.revoke({
    clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    sessionID: other.sessionID,
  });

  const refused = await safe(phone.sessions.list());

  expect(refused.isDefined).toBeTrue();
  expect(refused.error).toMatchObject({ code: 'UNAUTHORIZED', status: 401 });
});

test('#sessions.revoke answers a second revoke with the first time', async () => {
  const ctx = await setupTest();

  const other = await createDeviceSession(ctx.context, 'phone');
  const first = await ctx.client.sessions.revoke({
    clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    sessionID: other.sessionID,
  });

  ctx.clock.advance(5000);

  const second = await ctx.client.sessions.revoke({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    sessionID: other.sessionID,
  });

  expect(second.revokedAt).toStrictEqual(first.revokedAt);
});

test('#sessions.revoke refuses a session ID nixie never issued', async () => {
  const ctx = await setupTest();

  const result = await safe(
    ctx.client.sessions.revoke({
      clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
      sessionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    }),
  );

  expect(result.error).toMatchObject({ code: 'SESSION_NOT_FOUND' });
});

test('#sessions.revoke drops the cookie of a browser that revokes its own session', async () => {
  const ctx = await setupTest();

  const response = await fetch(`${ctx.url}/rpc/sessions/revoke`, {
    method: 'POST',
    headers: {
      [clientHeaderName]: 'web',
      'content-type': 'application/json',
      cookie: `${sessionCookieName}=${ctx.session.token}`,
    },
    body: JSON.stringify({
      json: {
        clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
        sessionID: ctx.session.sessionID,
      },
    }),
  });

  expect(response.headers.get('set-cookie')).toBe(
    `${sessionCookieName}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
  );
});

test('#conversation.send writes a message once for the same client message ID', async () => {
  const ctx = await setupTest();

  const input = {
    clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    thread: 'conversation',
    text: 'hello',
    spans: [{ start: 0, end: 5, source: 'typed' as const }],
  };
  const first = await ctx.client.conversation.send(input);
  const retry = await ctx.client.conversation.send(input);

  expect(first).toStrictEqual({ duplicate: false, sequence: expect.toBeNumber() });
  expect(retry).toStrictEqual({ duplicate: true, sequence: first.sequence });
});

test('#conversation.send refuses a client message ID that came with another text', async () => {
  const ctx = await setupTest();

  await ctx.client.conversation.send({
    clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    thread: 'conversation',
    text: 'hello',
    spans: [{ start: 0, end: 5, source: 'typed' }],
  });

  const result = await safe(
    ctx.client.conversation.send({
      clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
      thread: 'conversation',
      text: 'goodbye',
      spans: [{ start: 0, end: 7, source: 'typed' }],
    }),
  );

  expect(result.error).toMatchObject({ code: 'CLIENT_ACTION_ID_REUSED', status: 409 });
});

test('#conversation.send refuses a thread no task has', async () => {
  const ctx = await setupTest();

  const result = await safe(
    ctx.client.conversation.send({
      clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
      thread: 'task-404',
      text: 'hello',
      spans: [{ start: 0, end: 5, source: 'typed' }],
    }),
  );

  expect(result.error).toMatchObject({ code: 'THREAD_NOT_FOUND' });
});

test('#conversation.send from a revoked session writes only a refusal record', async () => {
  const ctx = await setupTest();

  const other = await createDeviceSession(ctx.context, 'phone');

  await ctx.client.sessions.revoke({
    clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    sessionID: other.sessionID,
  });

  const before = await ctx.db.selectFrom('records').select('kind').execute();
  const phone = createORPCClient<ContractClient>(
    new RPCLink({
      url: `${ctx.url}/rpc`,
      headers: { [clientHeaderName]: 'test', authorization: `Bearer ${other.token}` },
    }),
  );
  const result = await safe(
    phone.conversation.send({
      clientMessageId: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
      thread: 'conversation',
      text: 'a stranger writes',
      spans: [{ start: 0, end: 17, source: 'typed' }],
    }),
  );
  const after = await ctx.db.selectFrom('records').select('kind').execute();

  expect(result.error).toMatchObject({ code: 'UNAUTHORIZED' });
  expect(after.slice(before.length)).toStrictEqual([{ kind: 'identity.refused' }]);
});

test('#conversation.read returns a page of the thread and the sequence it read at', async () => {
  const ctx = await setupTest();

  const sent = await ctx.client.conversation.send({
    clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    thread: 'conversation',
    text: 'hello',
    spans: [{ start: 0, end: 5, source: 'typed' }],
  });
  const page = await ctx.client.conversation.read({ thread: 'conversation', limit: 1 });

  expect(page).toStrictEqual({
    hasEarlier: true,
    readAtSequence: sent.sequence,
    records: [
      {
        kind: 'owner_message',
        message: {
          clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
          spans: [{ start: 0, end: 5, source: 'typed' }],
          text: 'hello',
        },
        recordedAt: expect.toBeValidDate(),
        sequence: sent.sequence,
        thread: 'conversation',
      },
    ],
  });
});

test('#conversation.read refuses a thread with no records', async () => {
  const ctx = await setupTest();

  const result = await safe(ctx.client.conversation.read({ thread: 'task-404' }));

  expect(result.error).toMatchObject({ code: 'THREAD_NOT_FOUND' });
});

test('#log.follow resumes from the last event ID with exactly the records it missed', async () => {
  const ctx = await setupTest();

  const sendText = (clientMessageId: string, text: string) =>
    ctx.client.conversation.send({
      clientMessageId,
      thread: 'conversation',
      text,
      spans: [{ start: 0, end: text.length, source: 'typed' }],
    });

  await sendText('00000000-0000-4000-8000-000000000001', 'one').then(() =>
    sendText('00000000-0000-4000-8000-000000000002', 'two'),
  );

  const firstConnection = await ctx.client.log.follow({ afterSequence: 0, thread: 'conversation' });
  const seen = await collectEvents(firstConnection, 3);

  await firstConnection
    .return(undefined)
    .then(() => sendText('00000000-0000-4000-8000-000000000003', 'three'))
    .then(() => sendText('00000000-0000-4000-8000-000000000004', 'four'));

  const secondConnection = await ctx.client.log.follow(
    { afterSequence: 0, thread: 'conversation' },
    { lastEventId: String(seen.at(-1)?.record.sequence) },
  );
  const missed = await collectEvents(secondConnection, 2);

  expect(seen.map((event) => event.record.message?.text)).toStrictEqual([undefined, 'one', 'two']);
  expect(missed.map((event) => event.record.message?.text)).toStrictEqual(['three', 'four']);
});

test('#log.follow ends with UNAUTHORIZED once the session is revoked', async () => {
  const ctx = await setupTest();

  const stream = await ctx.client.log.follow({ afterSequence: 0, thread: 'conversation' });
  const reading = collectEvents(stream, Number.POSITIVE_INFINITY);

  await ctx.client.sessions.revoke({
    clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    sessionID: ctx.session.sessionID,
  });

  const ended = await reading.then(
    () => null,
    (error: unknown) => error,
  );

  expect(isDefinedError(ended)).toBeTrue();
  expect(ended).toMatchObject({ code: 'UNAUTHORIZED' });
});
