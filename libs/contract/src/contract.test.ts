import { expect, test } from 'bun:test';
import { getEventIteratorSchemaDetails } from '@orpc/contract';
import { buildOpenAPIDocument } from './build-openapi-document';
import { contract } from './contract';

test('it refuses an enrolment without its client action ID', () => {
  expect(
    contract.sessions.enrol['~orpc'].inputSchema?.safeParse({
      code: 'k7p-2xq',
      deviceName: 'laptop',
      tokenDelivery: 'cookie',
    }).error?.issues,
  ).toPartiallyContain({ path: ['clientActionID'] });
});

test('it refuses a code issue without its client action ID', () => {
  expect(
    contract.sessions.issueCode['~orpc'].inputSchema?.safeParse({}).error?.issues,
  ).toPartiallyContain({ path: ['clientActionID'] });
});

test('it refuses a session revoke without its client action ID', () => {
  expect(
    contract.sessions.revoke['~orpc'].inputSchema?.safeParse({
      sessionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    }).error?.issues,
  ).toPartiallyContain({ path: ['clientActionID'] });
});

test('it refuses a message send without its client message ID', () => {
  expect(
    contract.conversation.send['~orpc'].inputSchema?.safeParse({
      spans: [{ end: 5, source: 'typed', start: 0 }],
      text: 'hello',
      thread: 'conversation',
    }).error?.issues,
  ).toPartiallyContain({ path: ['clientMessageId'] });
});

test('it declares a reused action ID and an invalid code for enrolment, and no device session error', () => {
  expect(contract.sessions.enrol['~orpc'].errorMap).toContainAllKeys([
    'CLIENT_ACTION_ID_REUSED',
    'ENROLMENT_CODE_INVALID',
  ]);
});

test('it declares a missing device session and a reused action ID for a code issue', () => {
  expect(contract.sessions.issueCode['~orpc'].errorMap).toContainAllKeys([
    'UNAUTHORIZED',
    'CLIENT_ACTION_ID_REUSED',
  ]);
});

test('it declares a missing device session for a session list', () => {
  expect(contract.sessions.list['~orpc'].errorMap).toContainAllKeys(['UNAUTHORIZED']);
});

test('it declares a missing device session, a reused action ID and an unknown session for a revoke', () => {
  expect(contract.sessions.revoke['~orpc'].errorMap).toContainAllKeys([
    'UNAUTHORIZED',
    'CLIENT_ACTION_ID_REUSED',
    'SESSION_NOT_FOUND',
  ]);
});

test('it declares a missing device session, a reused action ID and an unknown thread for a send', () => {
  expect(contract.conversation.send['~orpc'].errorMap).toContainAllKeys([
    'UNAUTHORIZED',
    'CLIENT_ACTION_ID_REUSED',
    'THREAD_NOT_FOUND',
  ]);
});

test('it declares a missing device session, a reused action ID and an unknown record for a forget', () => {
  expect(contract.conversation.forget['~orpc'].errorMap).toContainAllKeys([
    'UNAUTHORIZED',
    'CLIENT_ACTION_ID_REUSED',
    'RECORD_NOT_FOUND',
  ]);
});

test('it answers an unknown record with 404 on a forget', () => {
  expect(contract.conversation.forget['~orpc'].errorMap.RECORD_NOT_FOUND?.status).toBe(404);
});

test('it refuses a forget without its client action ID', () => {
  expect(
    contract.conversation.forget['~orpc'].inputSchema?.safeParse({
      sequence: 42,
      thread: 'conversation',
    }).error?.issues,
  ).toPartiallyContain({ path: ['clientActionID'] });
});

test('it declares a missing device session and an unknown thread for a read', () => {
  expect(contract.conversation.read['~orpc'].errorMap).toContainAllKeys([
    'UNAUTHORIZED',
    'THREAD_NOT_FOUND',
  ]);
});

test('it declares a missing device session for a records follow', () => {
  expect(contract.records.follow['~orpc'].errorMap).toContainAllKeys(['UNAUTHORIZED']);
});

test('it declares a missing device session for the deprecated log follow', () => {
  expect(contract.log.follow['~orpc'].errorMap).toContainAllKeys(['UNAUTHORIZED']);
});

test('it answers a missing device session with 401', () => {
  expect(contract.sessions.list['~orpc'].errorMap.UNAUTHORIZED?.status).toBe(401);
});

test('it answers a reused client action ID with 409', () => {
  expect(contract.sessions.issueCode['~orpc'].errorMap.CLIENT_ACTION_ID_REUSED?.status).toBe(409);
});

test('it answers an invalid enrolment code with 400', () => {
  expect(contract.sessions.enrol['~orpc'].errorMap.ENROLMENT_CODE_INVALID?.status).toBe(400);
});

test('it answers an unknown session with 404', () => {
  expect(contract.sessions.revoke['~orpc'].errorMap.SESSION_NOT_FOUND?.status).toBe(404);
});

test('it answers an unknown thread with 404 on a read', () => {
  expect(contract.conversation.read['~orpc'].errorMap.THREAD_NOT_FOUND?.status).toBe(404);
});

test('it answers an unknown thread with 404 on a send', () => {
  expect(contract.conversation.send['~orpc'].errorMap.THREAD_NOT_FOUND?.status).toBe(404);
});

test('it accepts a message with its spans', () => {
  const payload = {
    clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    spans: [
      { end: 6, source: 'typed' as const, start: 0 },
      { end: 12, source: 'pasted' as const, start: 6 },
    ],
    text: 'hello PASTED',
    thread: 'conversation',
  };

  expect(contract.conversation.send['~orpc'].inputSchema?.safeParse(payload).data).toStrictEqual(
    payload,
  );
});

test('it refuses a span source outside the known sources', () => {
  expect(
    contract.conversation.send['~orpc'].inputSchema?.safeParse({
      clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
      spans: [{ end: 5, source: 'spoken', start: 0 }],
      text: 'hello',
      thread: 'conversation',
    }).error?.issues,
  ).toPartiallyContain({ path: ['spans', 0, 'source'] });
});

test('it refuses a span offset below zero', () => {
  expect(
    contract.conversation.send['~orpc'].inputSchema?.safeParse({
      clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
      spans: [{ end: 5, source: 'typed', start: -1 }],
      text: 'hello',
      thread: 'conversation',
    }).error?.issues,
  ).toPartiallyContain({ path: ['spans', 0, 'start'] });
});

test('it streams each record of the live stream as one event', () => {
  const record = {
    kind: 'owner_message',
    message: {
      clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
      spans: [{ end: 5, source: 'typed', start: 0 }],
      text: 'hello',
    },
    recordedAt: new Date('2026-10-10T12:00:00Z'),
    sequence: 42,
    thread: 'conversation',
  };

  expect(
    getEventIteratorSchemaDetails(contract.records.follow['~orpc'].outputSchema)?.yields[
      '~standard'
    ].validate({ record }),
  ).toStrictEqual({ value: { record } });
});

test('it generates an OpenAPI document with one operation for each procedure', () => {
  expect(buildOpenAPIDocument()).resolves.toMatchObject({
    paths: {
      '/conversation/forget': { post: { operationId: 'conversation.forget' } },
      '/conversation/read': { post: { operationId: 'conversation.read' } },
      '/conversation/send': { post: { operationId: 'conversation.send' } },
      '/log/follow': { post: { deprecated: true, operationId: 'log.follow' } },
      '/records/follow': { post: { operationId: 'records.follow' } },
      '/sessions/enrol': { post: { operationId: 'sessions.enrol' } },
      '/sessions/issueCode': { post: { operationId: 'sessions.issueCode' } },
      '/sessions/list': { post: { operationId: 'sessions.list' } },
      '/sessions/revoke': { post: { operationId: 'sessions.revoke' } },
    },
  });
});

// EasyPrivacy blocks /rpc/log/* and /rpc/log? on every domain, so a browser with a content blocker
// never reaches a procedure whose path holds a log segment.
test('it keeps a log segment out of the path of every procedure that is not deprecated', async () => {
  const document = await buildOpenAPIDocument();

  const current = Object.entries(document.paths ?? {})
    .filter(([, item]) => item?.post?.deprecated !== true)
    .map(([path]) => path);

  expect(current).toSatisfyAll((path: string) => !/\/log(?:[/?]|$)/u.test(path));
});
