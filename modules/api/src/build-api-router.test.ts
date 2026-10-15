import { expect, test } from 'bun:test';
import { clientHeaderName, sessionCookieName } from '@heynixie/contract';
import { writeRecords } from '@heynixie/log';
import { isDefinedError, safe } from '@orpc/client';
import { createEnrolmentCode } from './create-enrolment-code';
import { buildTestClient } from './test-utils/build-test-client';
import { collectEvents } from './test-utils/collect-events';
import { createDeviceSession } from './test-utils/create-device-session';
import { startTestAPI } from './test-utils/start-test-api';
import type { APITables } from './types';

async function setupTest() {
  const api = await startTestAPI();

  const db = api.writer.db.$extendTables<APITables & { records: { kind: string } }>();

  return { ...api, db };
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

  const enrolled = await buildTestClient(ctx.url).sessions.enrol({
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

  await buildTestClient(ctx.url).sessions.enrol({
    clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    code: issued.code,
    deviceName: 'phone',
    tokenDelivery: 'bearer',
  });

  const second = await safe(
    buildTestClient(ctx.url).sessions.enrol({
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
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const laptopClient = buildTestClient(ctx.url, laptop.token);

  const issued = await laptopClient.sessions.issueCode({
    clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
  });

  const enrolled = await buildTestClient(ctx.url).sessions.enrol({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    code: issued.code,
    deviceName: 'phone',
    tokenDelivery: 'bearer',
  });

  expect(issued.expiresAt).toStrictEqual(new Date(1_000_000 + 15 * 60 * 1000));
  expect(enrolled.sessionID).toBeString();
});

test('#sessions.issueCode answers a retry with a new code that keeps the first expiry', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const laptopClient = buildTestClient(ctx.url, laptop.token);

  const first = await laptopClient.sessions.issueCode({
    clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
  });

  const retry = await laptopClient.sessions.issueCode({
    clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
  });

  expect(retry.code).not.toBe(first.code);
  expect(retry.expiresAt).toStrictEqual(first.expiresAt);
});

test('#sessions.issueCode answers a retry with a code that replaces the first', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const laptopClient = buildTestClient(ctx.url, laptop.token);

  const first = await laptopClient.sessions.issueCode({
    clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
  });

  await laptopClient.sessions.issueCode({ clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60' });

  const enrolWithFirst = await safe(
    buildTestClient(ctx.url).sessions.enrol({
      clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
      code: first.code,
      deviceName: 'phone',
      tokenDelivery: 'bearer',
    }),
  );

  const codes = await ctx.db.selectFrom('enrolment_codes').select('used_at').execute();

  expect(enrolWithFirst.error).toMatchObject({ code: 'ENROLMENT_CODE_INVALID' });

  // the host code that enrolled the laptop, and the one code of this action
  expect(codes).toHaveLength(2);
});

test('#sessions.list lists the live sessions and marks the caller', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const laptopClient = buildTestClient(ctx.url, laptop.token);

  const other = await createDeviceSession(ctx.context, 'phone');
  const listed = await laptopClient.sessions.list();

  expect(listed.sessions).toIncludeSameMembers([
    {
      createdAt: new Date(1_000_000),
      current: true,
      deviceName: 'laptop',
      lastUsedAt: new Date(1_000_000),
      sessionID: laptop.sessionID,
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
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const laptopClient = buildTestClient(ctx.url, laptop.token);

  const other = await createDeviceSession(ctx.context, 'phone');

  const phone = buildTestClient(ctx.url, other.token);

  await laptopClient.sessions.revoke({
    clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    sessionID: other.sessionID,
  });

  const refused = await safe(phone.sessions.list());

  expect(refused.isDefined).toBeTrue();
  expect(refused.error).toMatchObject({ code: 'UNAUTHORIZED', status: 401 });
});

test('#sessions.revoke answers a second revoke with the first time', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const laptopClient = buildTestClient(ctx.url, laptop.token);

  const other = await createDeviceSession(ctx.context, 'phone');

  const first = await laptopClient.sessions.revoke({
    clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    sessionID: other.sessionID,
  });

  ctx.clock.advance(5000);

  const second = await laptopClient.sessions.revoke({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    sessionID: other.sessionID,
  });

  expect(second.revokedAt).toStrictEqual(first.revokedAt);
});

test('#sessions.revoke refuses a session ID nixie never issued', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const laptopClient = buildTestClient(ctx.url, laptop.token);

  const result = await safe(
    laptopClient.sessions.revoke({
      clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
      sessionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    }),
  );

  expect(result.error).toMatchObject({ code: 'SESSION_NOT_FOUND' });
});

test('#sessions.revoke drops the cookie of a browser that revokes its own session', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const response = await fetch(`${ctx.url}/rpc/sessions/revoke`, {
    method: 'POST',
    headers: {
      [clientHeaderName]: 'web',
      'content-type': 'application/json',
      cookie: `${sessionCookieName}=${laptop.token}`,
    },
    body: JSON.stringify({
      json: {
        clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
        sessionID: laptop.sessionID,
      },
    }),
  });

  expect(response.headers.get('set-cookie')).toBe(
    `${sessionCookieName}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
  );
});

test('#conversation.send writes a message once for the same client message ID', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const laptopClient = buildTestClient(ctx.url, laptop.token);

  const input = {
    clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    thread: 'conversation',
    text: 'hello',
    spans: [{ start: 0, end: 5, source: 'typed' as const }],
  };

  const first = await laptopClient.conversation.send(input);
  const retry = await laptopClient.conversation.send(input);

  expect(first).toStrictEqual({ duplicate: false, sequence: expect.toBeNumber() });
  expect(retry).toStrictEqual({ duplicate: true, sequence: first.sequence });
});

test('#conversation.send refuses a client message ID that came with another text', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const laptopClient = buildTestClient(ctx.url, laptop.token);

  await laptopClient.conversation.send({
    clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    thread: 'conversation',
    text: 'hello',
    spans: [{ start: 0, end: 5, source: 'typed' }],
  });

  const result = await safe(
    laptopClient.conversation.send({
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
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const laptopClient = buildTestClient(ctx.url, laptop.token);

  const result = await safe(
    laptopClient.conversation.send({
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
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const laptopClient = buildTestClient(ctx.url, laptop.token);

  const other = await createDeviceSession(ctx.context, 'phone');

  await laptopClient.sessions.revoke({
    clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    sessionID: other.sessionID,
  });

  const before = await ctx.db.selectFrom('records').select('kind').execute();

  const result = await safe(
    buildTestClient(ctx.url, other.token).conversation.send({
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

test('#conversation.forget forgets a message, which the thread then shows with no text', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const laptopClient = buildTestClient(ctx.url, laptop.token);

  const sent = await laptopClient.conversation.send({
    clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    thread: 'conversation',
    text: 'The locker code is 2291.',
    spans: [],
  });

  const result = await laptopClient.conversation.forget({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    sequence: sent.sequence,
    thread: 'conversation',
  });

  const page = await laptopClient.conversation.read({ thread: 'conversation' });

  expect(result).toStrictEqual({ forgottenAt: expect.any(Date) });

  expect(page.records.filter((record) => record.sequence >= sent.sequence)).toMatchObject([
    { kind: 'owner_message', sequence: sent.sequence },
    { kind: 'record.forget_started', forget: { sequence: sent.sequence } },
  ]);

  expect(page.records.find((record) => record.sequence === sent.sequence)?.message).toBeUndefined();
});

test('#conversation.forget refuses a sequence that names no message on the thread', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const laptopClient = buildTestClient(ctx.url, laptop.token);

  const result = await safe(
    laptopClient.conversation.forget({
      clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
      sequence: 9999,
      thread: 'conversation',
    }),
  );

  expect(result.error).toMatchObject({ code: 'RECORD_NOT_FOUND', status: 404 });
});

test('#conversation.forget refuses a client action ID that came before for another record', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const laptopClient = buildTestClient(ctx.url, laptop.token);

  const first = await laptopClient.conversation.send({
    clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    thread: 'conversation',
    text: 'The locker code is 2291.',
    spans: [],
  });

  const second = await laptopClient.conversation.send({
    clientMessageId: '3c8f1a52-7d2e-4b9c-8e6f-0a4d2b7c9e15',
    thread: 'conversation',
    text: 'And the bike lock is 7734.',
    spans: [],
  });

  await laptopClient.conversation.forget({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    sequence: first.sequence,
    thread: 'conversation',
  });

  const result = await safe(
    laptopClient.conversation.forget({
      clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
      sequence: second.sequence,
      thread: 'conversation',
    }),
  );

  expect(result.error).toMatchObject({ code: 'CLIENT_ACTION_ID_REUSED', status: 409 });
});

test('#conversation.forget refuses a caller with no session', async () => {
  const ctx = await setupTest();

  const result = await safe(
    buildTestClient(ctx.url).conversation.forget({
      clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
      sequence: 1,
      thread: 'conversation',
    }),
  );

  expect(result.error).toMatchObject({ code: 'UNAUTHORIZED', status: 401 });
});

test('#conversation.read returns a page of the thread and the sequence it read at', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const laptopClient = buildTestClient(ctx.url, laptop.token);

  const sent = await laptopClient.conversation.send({
    clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    thread: 'conversation',
    text: 'hello',
    spans: [{ start: 0, end: 5, source: 'typed' }],
  });

  const page = await laptopClient.conversation.read({ thread: 'conversation', limit: 1 });

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
    lastStepEnd: null,
  });
});

test('#conversation.read refuses a thread with no records', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const laptopClient = buildTestClient(ctx.url, laptop.token);

  const result = await safe(laptopClient.conversation.read({ thread: 'task-404' }));

  expect(result.error).toMatchObject({ code: 'THREAD_NOT_FOUND' });
});

test('#records.follow streams the records of the thread after the sequence asked for', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const laptopClient = buildTestClient(ctx.url, laptop.token);

  const sendText = (clientMessageId: string, text: string) =>
    laptopClient.conversation.send({
      clientMessageId,
      thread: 'conversation',
      text,
      spans: [{ start: 0, end: text.length, source: 'typed' }],
    });

  await sendText('00000000-0000-4000-8000-000000000001', 'one').then(() =>
    sendText('00000000-0000-4000-8000-000000000002', 'two'),
  );

  const connection = await laptopClient.records.follow({
    afterSequence: 0,
    thread: 'conversation',
  });

  const seen = await collectEvents(connection, 3);

  expect(seen.map((event) => event.record.message?.text)).toStrictEqual([undefined, 'one', 'two']);
});

test('#log.follow still streams the records of the thread for a client of an earlier release', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const laptopClient = buildTestClient(ctx.url, laptop.token);

  await laptopClient.conversation.send({
    clientMessageId: '00000000-0000-4000-8000-000000000001',
    thread: 'conversation',
    text: 'one',
    spans: [{ start: 0, end: 3, source: 'typed' }],
  });

  const connection = await laptopClient.log.follow({ afterSequence: 0, thread: 'conversation' });
  const seen = await collectEvents(connection, 2);

  expect(seen.map((event) => event.record.message?.text)).toStrictEqual([undefined, 'one']);
});

test('#records.follow resumes from the last event ID with exactly the records it missed', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const laptopClient = buildTestClient(ctx.url, laptop.token);

  const sendText = (clientMessageId: string, text: string) =>
    laptopClient.conversation.send({
      clientMessageId,
      thread: 'conversation',
      text,
      spans: [{ start: 0, end: text.length, source: 'typed' }],
    });

  const firstConnection = await sendText('00000000-0000-4000-8000-000000000001', 'one')
    .then(() => sendText('00000000-0000-4000-8000-000000000002', 'two'))
    .then(() => laptopClient.records.follow({ afterSequence: 0, thread: 'conversation' }));

  const seen = await collectEvents(firstConnection, 3);

  await firstConnection
    .return(undefined)
    .then(() => sendText('00000000-0000-4000-8000-000000000003', 'three'))
    .then(() => sendText('00000000-0000-4000-8000-000000000004', 'four'));

  const secondConnection = await laptopClient.records.follow(
    { afterSequence: 0, thread: 'conversation' },
    { lastEventId: String(seen.at(-1)?.record.sequence) },
  );

  const missed = await collectEvents(secondConnection, 2);

  expect(missed.map((event) => event.record.message?.text)).toStrictEqual(['three', 'four']);
});

test('#records.follow ends with UNAUTHORIZED once the session is revoked', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const laptopClient = buildTestClient(ctx.url, laptop.token);

  const stream = await laptopClient.records.follow({ afterSequence: 0, thread: 'conversation' });

  const reading = collectEvents(stream, Number.POSITIVE_INFINITY);

  await laptopClient.sessions.revoke({
    clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    sessionID: laptop.sessionID,
  });

  const ended = await reading.then(
    () => null,
    (error: unknown) => error,
  );

  expect(isDefinedError(ended)).toBeTrue();
  expect(ended).toMatchObject({ code: 'UNAUTHORIZED' });
});

test('#records.follow started past the head still ends once the session is revoked', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const laptopClient = buildTestClient(ctx.url, laptop.token);

  const stream = await laptopClient.records.follow({
    afterSequence: 1_000_000,
    thread: 'conversation',
  });

  const reading = collectEvents(stream, Number.POSITIVE_INFINITY);

  await laptopClient.sessions.revoke({
    clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    sessionID: laptop.sessionID,
  });

  const ended = await reading.then(
    () => null,
    (error: unknown) => error,
  );

  expect(ended).toMatchObject({ code: 'UNAUTHORIZED' });
});

test('#records.follow refuses a revoked session before the stream opens', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const laptopClient = buildTestClient(ctx.url, laptop.token);

  await laptopClient.sessions.revoke({
    clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    sessionID: laptop.sessionID,
  });

  expect(
    laptopClient.records.follow({ afterSequence: 0, thread: 'conversation' }),
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('#sessions.issueCode refuses a retry once its code enrolled a device', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const laptopClient = buildTestClient(ctx.url, laptop.token);

  const issued = await laptopClient.sessions.issueCode({
    clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
  });

  await buildTestClient(ctx.url).sessions.enrol({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    code: issued.code,
    deviceName: 'phone',
    tokenDelivery: 'bearer',
  });

  const retry = await safe(
    laptopClient.sessions.issueCode({ clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60' }),
  );

  expect(retry.error).toMatchObject({ code: 'CLIENT_ACTION_ID_REUSED' });
});

test("#sessions.issueCode refuses another session's retry of the action", async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const laptopClient = buildTestClient(ctx.url, laptop.token);

  const other = await createDeviceSession(ctx.context, 'phone');

  const phone = buildTestClient(ctx.url, other.token);

  await laptopClient.sessions.issueCode({ clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60' });

  const retry = await safe(
    phone.sessions.issueCode({ clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60' }),
  );

  expect(retry.error).toMatchObject({ code: 'CLIENT_ACTION_ID_REUSED' });
});

test('#memory.writerStatus reports every message of yours as backlog before the writer starts', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const laptopClient = buildTestClient(ctx.url, laptop.token);

  await laptopClient.conversation.send({
    clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    thread: 'conversation',
    text: 'hello',
    spans: [{ start: 0, end: 5, source: 'typed' }],
  });

  const status = await laptopClient.memory.writerStatus();

  expect(status).toStrictEqual({
    backlog: 1,
    batches: 0,
    cursor: 0,
    failures: 0,
    isCatchingUp: true,
    lastError: null,
    retryAt: null,
  });
});

test('#memory.writerStatus reports the last error with its time and when the writer tries again', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  await writeRecords(ctx.context.log, [
    {
      kind: 'memory.writer_started',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'memory-writer',
      payload: { startSequence: 0, at: 1_000_000 },
    },
    {
      kind: 'memory.writer_failed',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'memory-writer',
      payload: { code: 'batch_failed', failures: 2, retryAt: 1_060_000, at: 1_000_500 },
      erasable: { message: 'the model API refused the request' },
    },
  ]);

  const status = await buildTestClient(ctx.url, laptop.token).memory.writerStatus();

  expect(status).toStrictEqual({
    backlog: 0,
    batches: 0,
    cursor: 0,
    failures: 2,
    isCatchingUp: true,
    lastError: {
      at: new Date(1_000_500),
      code: 'batch_failed',
      message: 'the model API refused the request',
    },
    retryAt: new Date(1_060_000),
  });
});

test('#memory.writerStatus refuses a caller with no session', async () => {
  const ctx = await setupTest();

  const status = buildTestClient(ctx.url).memory.writerStatus();

  await status.catch(() => {});

  expect(status).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});
