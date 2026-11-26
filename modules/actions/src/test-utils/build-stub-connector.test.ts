import { expect, test } from 'bun:test';
import { buildStubConnector } from './build-stub-connector';

test('it answers each call with the response the test set, and records the call', async () => {
  const stub = buildStubConnector(() => ({ kind: 'success', result: { messageID: 'm-1' } }));

  const response = await stub.connector.run({
    actionID: 'action-1',
    tool: 'test.send',
    arguments: { to: 'someone' },
    attempt: 1,
    snapshotHash: 'sha256:test',
    idempotencyKey: 'action-1',
    destinations: [],
    actionHash: 'hash-1',
    deadlineAt: null,
  });

  expect(response).toStrictEqual({ kind: 'success', result: { messageID: 'm-1' } });

  expect(stub.calls).toStrictEqual([
    {
      actionID: 'action-1',
      tool: 'test.send',
      arguments: { to: 'someone' },
      attempt: 1,
      snapshotHash: 'sha256:test',
      idempotencyKey: 'action-1',
      destinations: [],
      actionHash: 'hash-1',
      deadlineAt: null,
    },
  ]);
});

test('it rejects the call when the response throws, as a dropped connection does', () => {
  const stub = buildStubConnector(() => {
    throw new Error('socket hang up');
  });

  const call = stub.connector.run({
    actionID: 'action-1',
    tool: 'test.send',
    arguments: {},
    attempt: 1,
    snapshotHash: 'sha256:test',
    idempotencyKey: 'action-1',
    destinations: [],
    actionHash: 'hash-1',
    deadlineAt: null,
  });

  expect(call).rejects.toThrowWithMessage(Error, 'socket hang up');
});

test('it declares how an unknown outcome settles, and answers and records each check', async () => {
  const stub = buildStubConnector(() => ({ kind: 'ambiguous', reason: 'timed out' }), {
    reconcile: { kind: 'check', tool: 'test.send' },
    answerCheck: () => ({ kind: 'not_found' }),
  });

  const answer = await stub.connector.check?.({
    actionID: 'action-1',
    tool: 'test.send',
    arguments: {},
    attempt: 1,
    snapshotHash: 'sha256:test',
    idempotencyKey: 'action-1',
    destinations: [],
    actionHash: 'hash-1',
    deadlineAt: null,
  });

  expect(stub.connector.reconcile).toStrictEqual({ kind: 'check', tool: 'test.send' });
  expect(answer).toStrictEqual({ kind: 'not_found' });
  expect(stub.checks.map((check) => check.actionID)).toStrictEqual(['action-1']);
});

test('it answers a check inconclusive when the test gave no answer', async () => {
  const stub = buildStubConnector(() => ({ kind: 'ambiguous', reason: 'timed out' }), {
    reconcile: { kind: 'check', tool: 'test.send' },
  });

  const answer = await stub.connector.check?.({
    actionID: 'action-1',
    tool: 'test.send',
    arguments: {},
    attempt: 1,
    snapshotHash: 'sha256:test',
    idempotencyKey: 'action-1',
    destinations: [],
    actionHash: 'hash-1',
    deadlineAt: null,
  });

  expect(answer).toStrictEqual({ kind: 'inconclusive' });
});
