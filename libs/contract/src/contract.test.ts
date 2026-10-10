import { expect, test } from 'bun:test';
import { getEventIteratorSchemaDetails } from '@orpc/contract';
import { contract } from './contract';

test.each([
  {
    idField: 'clientActionID',
    name: 'sessions.enrol',
    payload: { code: 'k7p-2xq', deviceName: 'laptop', tokenDelivery: 'cookie' },
    procedure: contract.sessions.enrol,
  },
  {
    idField: 'clientActionID',
    name: 'sessions.issueCode',
    payload: {},
    procedure: contract.sessions.issueCode,
  },
  {
    idField: 'clientActionID',
    name: 'sessions.revoke',
    payload: { sessionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85' },
    procedure: contract.sessions.revoke,
  },
  {
    idField: 'clientMessageID',
    name: 'conversation.send',
    payload: {
      spans: [{ end: 5, source: 'typed', start: 0 }],
      text: 'hello',
      thread: 'conversation',
    },
    procedure: contract.conversation.send,
  },
])('it refuses a $name call without its client action ID', (row) => {
  expect(
    row.procedure['~orpc'].inputSchema?.safeParse(row.payload).error?.issues,
  ).toPartiallyContain({
    path: [row.idField],
  });
});

test('it declares a typed error for a reused client action ID on every checked action', () => {
  expect([
    contract.sessions.enrol['~orpc'].errorMap,
    contract.sessions.issueCode['~orpc'].errorMap,
    contract.sessions.revoke['~orpc'].errorMap,
    contract.conversation.send['~orpc'].errorMap,
  ]).toSatisfyAll((errorMap: object) => 'CLIENT_ACTION_ID_REUSED' in errorMap);
});

test('it declares UNAUTHORIZED on every procedure that needs a device session', () => {
  expect([
    contract.sessions.issueCode['~orpc'].errorMap,
    contract.sessions.list['~orpc'].errorMap,
    contract.sessions.revoke['~orpc'].errorMap,
    contract.conversation.send['~orpc'].errorMap,
    contract.conversation.read['~orpc'].errorMap,
    contract.log.follow['~orpc'].errorMap,
  ]).toSatisfyAll((errorMap: object) => 'UNAUTHORIZED' in errorMap);
});

test('it lets enrolment run without a device session', () => {
  expect(contract.sessions.enrol['~orpc'].errorMap).not.toContainKey('UNAUTHORIZED');
});

test('it accepts a message with its spans', () => {
  const payload = {
    clientMessageID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
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
      clientMessageID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
      spans: [{ end: 5, source: 'spoken', start: 0 }],
      text: 'hello',
      thread: 'conversation',
    }).error?.issues,
  ).toPartiallyContain({ path: ['spans', 0, 'source'] });
});

test('it refuses a span offset below zero', () => {
  expect(
    contract.conversation.send['~orpc'].inputSchema?.safeParse({
      clientMessageID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
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
      clientMessageID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
      spans: [{ end: 5, source: 'typed', start: 0 }],
      text: 'hello',
    },
    recordedAt: new Date('2026-10-10T12:00:00Z'),
    sequence: 42,
    thread: 'conversation',
  };

  expect(
    getEventIteratorSchemaDetails(contract.log.follow['~orpc'].outputSchema)?.yields[
      '~standard'
    ].validate({ record }),
  ).toStrictEqual({ value: { record } });
});
