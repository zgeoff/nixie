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

test('it declares a missing device session, a reused action ID, an unknown thread and a refused image for a send', () => {
  expect(contract.conversation.send['~orpc'].errorMap).toContainAllKeys([
    'UNAUTHORIZED',
    'CLIENT_ACTION_ID_REUSED',
    'THREAD_NOT_FOUND',
    'IMAGE_REFUSED',
  ]);
});

test('it answers a refused image with 422 and the reason on a send', () => {
  const refused = contract.conversation.send['~orpc'].errorMap.IMAGE_REFUSED;

  expect(refused?.status).toBe(422);
  expect(refused?.data?.safeParse({ position: 1, reason: 'too_large' }).success).toBeTrue();
});

test('it declares a missing device session and a missing image for an image read', () => {
  expect(contract.conversation.readImage['~orpc'].errorMap).toContainAllKeys([
    'UNAUTHORIZED',
    'IMAGE_NOT_FOUND',
  ]);
});

test('it refuses an image read without its position', () => {
  const result = contract.conversation.readImage['~orpc'].inputSchema?.safeParse({
    sequence: 4,
    thread: 'conversation',
  });

  expect(result?.error?.issues).toPartiallyContain({ path: ['position'] });
});

test('it declares a missing device session and a missing image for an approval image read', () => {
  expect(contract.approvals.readImage['~orpc'].errorMap).toContainAllKeys([
    'UNAUTHORIZED',
    'IMAGE_NOT_FOUND',
  ]);
});

test('it declares a missing device session, a reused action ID, an unknown record and an unfinished action for a forget', () => {
  expect(contract.conversation.forget['~orpc'].errorMap).toContainAllKeys([
    'UNAUTHORIZED',
    'CLIENT_ACTION_ID_REUSED',
    'RECORD_NOT_FOUND',
    'ACTION_NOT_FINISHED',
  ]);
});

test('it answers a queued action that has not run with 409 on a forget', () => {
  expect(contract.conversation.forget['~orpc'].errorMap.ACTION_NOT_FINISHED?.status).toBe(409);
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

test('it declares a missing device session, a reused action ID and nothing to retry for a retry', () => {
  expect(contract.conversation.retry['~orpc'].errorMap).toContainAllKeys([
    'UNAUTHORIZED',
    'CLIENT_ACTION_ID_REUSED',
    'NOTHING_TO_RETRY',
  ]);
});

test.each([
  ['UNAUTHORIZED', 401],
  ['CLIENT_ACTION_ID_REUSED', 409],
  ['NOTHING_TO_RETRY', 409],
] as const)('it answers %s with %i on a retry', (code, status) => {
  expect(contract.conversation.retry['~orpc'].errorMap[code]?.status).toBe(status);
});

test('it refuses a retry without its client action ID', () => {
  expect(
    contract.conversation.retry['~orpc'].inputSchema?.safeParse({}).error?.issues,
  ).toPartiallyContain({ path: ['clientActionID'] });
});

test('it declares a missing device session and an unknown thread for a read', () => {
  expect(contract.conversation.read['~orpc'].errorMap).toContainAllKeys([
    'UNAUTHORIZED',
    'THREAD_NOT_FOUND',
  ]);
});

test('it declares a missing session, a refused page form and a missing device row for a live follow', () => {
  expect(contract.live.follow['~orpc'].errorMap).toContainAllKeys([
    'UNAUTHORIZED',
    'FORBIDDEN',
    'NOT_A_DEVICE',
  ]);
});

test('it leaves the old streams out of the contract', () => {
  expect(Object.keys(contract)).not.toContain('log');
  expect(Object.keys(contract.records)).toStrictEqual(['readPayload']);
  expect(Object.keys(contract.devices)).not.toContain('follow');
});

test.each([
  ['a page form with a thread', { afterSequence: 4812, thread: 't7k2' }],
  ['a page form with nothing', {}],
  ['a device form', { device: { pixels: { width: 1080, height: 1920, pixelRatio: 2 } } }],
])('it accepts %s for a live follow', (_title, input) => {
  expect(contract.live.follow['~orpc'].inputSchema?.safeParse(input).success).toBe(true);
});

test('it refuses a live follow that mixes the page and device forms', () => {
  expect(
    contract.live.follow['~orpc'].inputSchema?.safeParse({
      thread: 't7k2',
      device: { pixels: { width: 1080, height: 1920 } },
    }).success,
  ).toBe(false);
});

test.each([
  ['opened', { kind: 'opened' }],
  ['changed', { kind: 'changed', topics: ['nixie', 'tasks'] }],
  ['device', { kind: 'device', event: { kind: 'idle', scene: [] } }],
])('it streams a %s event of a live follow', (_title, event) => {
  expect(
    getEventIteratorSchemaDetails(contract.live.follow['~orpc'].outputSchema)?.yields[
      '~standard'
    ].validate(event),
  ).toStrictEqual({ value: event });
});

test('it refuses a changed event with no topic', () => {
  expect(
    getEventIteratorSchemaDetails(contract.live.follow['~orpc'].outputSchema)?.yields[
      '~standard'
    ].validate({ kind: 'changed', topics: [] }),
  ).toHaveProperty('issues');
});

test('it declares a missing session for a sessions shown', () => {
  expect(contract.sessions.shown['~orpc'].errorMap).toContainAllKeys(['UNAUTHORIZED']);
});

test('it returns the time a task list next changes on its own', () => {
  const tasks = { readAtSequence: 4812, tasks: [], changesAt: new Date('2026-11-24T09:00:00Z') };

  expect(contract.tasks.list['~orpc'].outputSchema?.['~standard'].validate(tasks)).toStrictEqual({
    value: tasks,
  });
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

test('it streams each record of a live follow as one event', () => {
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
    getEventIteratorSchemaDetails(contract.live.follow['~orpc'].outputSchema)?.yields[
      '~standard'
    ].validate({ kind: 'record', record }),
  ).toStrictEqual({ value: { kind: 'record', record } });
});

test('it generates an OpenAPI document with one operation for each procedure', () => {
  expect(buildOpenAPIDocument()).resolves.toMatchObject({
    paths: {
      '/conversation/forget': { post: { operationId: 'conversation.forget' } },
      '/conversation/read': { post: { operationId: 'conversation.read' } },
      '/conversation/send': { post: { operationId: 'conversation.send' } },
      '/live/follow': { post: { operationId: 'live.follow' } },
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

test('it declares a missing device session and a reused action ID for a nixie pause and resume', () => {
  expect(contract.nixie.pause['~orpc'].errorMap).toContainAllKeys([
    'UNAUTHORIZED',
    'CLIENT_ACTION_ID_REUSED',
  ]);

  expect(contract.nixie.resume['~orpc'].errorMap).toContainAllKeys([
    'UNAUTHORIZED',
    'CLIENT_ACTION_ID_REUSED',
    'SPEND_STOP_STANDS',
  ]);
});

test('it refuses a nixie pause without its client action ID', () => {
  expect(contract.nixie.pause['~orpc'].inputSchema?.safeParse({}).error?.issues).toPartiallyContain(
    { path: ['clientActionID'] },
  );
});
