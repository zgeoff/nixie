import { expect, onTestFinished, test } from 'bun:test';
import { startProviderDouble } from '@heynixie/testing';
import { buildTestConnector } from './build-test-connector';

function setupTest() {
  const provider = startProviderDouble();

  onTestFinished(() => provider.stop());

  return { provider, connector: buildTestConnector(provider.url) };
}

test('it sends the call to the provider with its idempotency key and returns its result', async () => {
  const ctx = setupTest();

  ctx.provider.addReplies({ kind: 'success', result: { delivered: true } });

  const response = await ctx.connector.run({
    actionID: 'action-1',
    tool: 'test.send',
    arguments: { to: 'the pantry list', body: 'Buy oat milk' },
    attempt: 1,
    idempotencyKey: 'send-1',
  });

  expect(response).toStrictEqual({ kind: 'success', result: { delivered: true } });

  expect(ctx.provider.calls).toStrictEqual([
    { idempotencyKey: 'send-1', body: { to: 'the pantry list', body: 'Buy oat milk' } },
  ]);
});

test('it reports a provider that asks for a retry later as retryable, with its delay', async () => {
  const ctx = setupTest();

  ctx.provider.addReplies({
    kind: 'refused_retryable',
    reason: 'the provider is busy',
    retryAfterMs: 2000,
  });

  const response = await ctx.connector.run({
    actionID: 'action-2',
    tool: 'test.send',
    arguments: { to: 'the pantry list', body: 'Buy oat milk' },
    attempt: 1,
    idempotencyKey: 'send-2',
  });

  expect(response).toStrictEqual({
    kind: 'refused_retryable',
    reason: 'the provider is busy',
    retryAfterMs: 2000,
  });
});

test('it reports a provider that refuses the call as refused', async () => {
  const ctx = setupTest();

  ctx.provider.addReplies({ kind: 'refused', reason: 'the list is closed' });

  const response = await ctx.connector.run({
    actionID: 'action-3',
    tool: 'test.send',
    arguments: { to: 'the pantry list', body: 'Buy oat milk' },
    attempt: 1,
    idempotencyKey: 'send-3',
  });

  expect(response).toStrictEqual({ kind: 'refused', reason: 'the list is closed' });
});
