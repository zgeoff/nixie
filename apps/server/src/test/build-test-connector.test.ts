import { expect, onTestFinished, test } from 'bun:test';
import { startProviderDouble } from '@heynixie/testing';
import { buildTestConnector } from './build-test-connector';

function setupTest() {
  const provider = startProviderDouble();

  onTestFinished(() => provider.stop());

  return { provider, connector: buildTestConnector(provider.url, 'none') };
}

test('it sends the call to the provider with its idempotency key and returns its result', async () => {
  const ctx = setupTest();

  ctx.provider.addReplies({ kind: 'success', result: { delivered: true } });

  const response = await ctx.connector.run({
    actionID: 'action-1',
    tool: 'test.send',
    arguments: { to: 'the pantry list', body: 'Buy oat milk' },
    attempt: 1,
    snapshotHash: 'sha256:test',
    idempotencyKey: 'send-1',
    destinations: [],
    actionHash: 'hash-1',
    deadlineAt: null,
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
    snapshotHash: 'sha256:test',
    idempotencyKey: 'send-2',
    destinations: [],
    actionHash: 'hash-1',
    deadlineAt: null,
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
    snapshotHash: 'sha256:test',
    idempotencyKey: 'send-3',
    destinations: [],
    actionHash: 'hash-1',
    deadlineAt: null,
  });

  expect(response).toStrictEqual({ kind: 'refused', reason: 'the list is closed' });
});

test('it declares no reconciliation for the plain send, a key for the keyed send and a check for the checked send', () => {
  const provider = startProviderDouble();

  onTestFinished(() => provider.stop());

  expect([
    buildTestConnector(provider.url, 'none').reconcile,
    buildTestConnector(provider.url, 'keyed').reconcile,
    buildTestConnector(provider.url, 'checked').reconcile,
  ]).toStrictEqual([
    { kind: 'none' },
    { kind: 'idempotency_key', where: 'the idempotency-key header', keptForMs: 3_600_000 },
    { kind: 'check', tool: 'test.send_checked' },
  ]);
});

test('it reports a send whose destinations changed as destinations changed', async () => {
  const ctx = setupTest();

  ctx.provider.addReplies({ kind: 'destinations_changed', reason: 'the list grew' });

  const response = await ctx.connector.run({
    actionID: 'action-1',
    tool: 'test.send',
    arguments: { to: 'team', body: 'Hello' },
    attempt: 1,
    snapshotHash: 'sha256:test',
    idempotencyKey: 'send-4',
    destinations: ['team'],
    actionHash: 'hash-1',
    deadlineAt: null,
  });

  expect(response).toStrictEqual({ kind: 'destinations_changed', reason: 'the list grew' });
});

test.each([
  [
    { kind: 'found', result: { delivered: true } } as const,
    { kind: 'found', result: { delivered: true } } as const,
  ],
  [{ kind: 'not_found' } as const, { kind: 'not_found' } as const],
  [{ kind: 'inconclusive' } as const, { kind: 'inconclusive' } as const],
])('it reads the provider check answer %o as %o', async (reply, expected) => {
  const provider = startProviderDouble();

  onTestFinished(() => provider.stop());

  provider.addCheckReplies(reply);

  const connector = buildTestConnector(provider.url, 'checked');

  const answer = await connector.check?.({
    actionID: 'action-1',
    tool: 'test.send_checked',
    arguments: { to: 'team', body: 'Hello' },
    attempt: 1,
    snapshotHash: 'sha256:test',
    idempotencyKey: 'send-5',
    destinations: [],
    actionHash: 'hash-1',
    deadlineAt: null,
  });

  expect(answer).toStrictEqual(expected);

  expect(provider.checkCalls).toStrictEqual([
    { idempotencyKey: 'send-5', body: { to: 'team', body: 'Hello' } },
  ]);
});
