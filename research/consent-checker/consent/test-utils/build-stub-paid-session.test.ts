import { expect, test } from 'bun:test';
import { buildStubPaidSession } from './build-stub-paid-session.ts';

test('it yields its messages in order and then ends', async () => {
  const stub = buildStubPaidSession([{ type: 'system' }, { type: 'result' }]);

  const messages = await Array.fromAsync(stub.session);

  expect(messages).toStrictEqual([{ type: 'system' }, { type: 'result' }]);
});

test('it reports the session open until it is closed', () => {
  const stub = buildStubPaidSession([]);
  const isClosedBefore = stub.isClosed();

  stub.session.close();

  expect(isClosedBefore).toBe(false);
  expect(stub.isClosed()).toBe(true);
});
