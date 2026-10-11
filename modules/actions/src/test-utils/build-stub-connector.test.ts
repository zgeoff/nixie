import { expect, test } from 'bun:test';
import { buildStubConnector } from './build-stub-connector';

test('it answers each call with the response the test set, and records the call', async () => {
  const stub = buildStubConnector(() => ({ kind: 'success', result: { messageID: 'm-1' } }));

  const response = await stub.connector.run({
    actionID: 'action-1',
    tool: 'test.send',
    arguments: { to: 'someone' },
    attempt: 1,
    idempotencyKey: 'action-1',
  });

  expect(response).toStrictEqual({ kind: 'success', result: { messageID: 'm-1' } });
  expect(stub.calls).toStrictEqual([
    {
      actionID: 'action-1',
      tool: 'test.send',
      arguments: { to: 'someone' },
      attempt: 1,
      idempotencyKey: 'action-1',
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
    idempotencyKey: 'action-1',
  });

  expect(call).rejects.toThrowWithMessage(Error, 'socket hang up');
});
