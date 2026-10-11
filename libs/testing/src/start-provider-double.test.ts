import { expect, onTestFinished, test } from 'bun:test';
import { startProviderDouble } from './start-provider-double';
import { waitForCondition } from './wait-for-condition';

function setupTest() {
  const provider = startProviderDouble();

  onTestFinished(() => provider.stop());

  return { provider };
}

test('it records each call with its idempotency key and body', async () => {
  const ctx = setupTest();

  ctx.provider.addReplies({ kind: 'success', result: { delivered: true } });
  await fetch(`${ctx.provider.url}/send`, {
    method: 'POST',
    headers: { 'idempotency-key': 'action-1' },
    body: JSON.stringify({ to: 'team' }),
  });

  expect(ctx.provider.calls).toStrictEqual([{ idempotencyKey: 'action-1', body: { to: 'team' } }]);
});

test('it records a call that carries no idempotency key with a null key', async () => {
  const ctx = setupTest();

  ctx.provider.addReplies({ kind: 'success', result: {} });
  await fetch(`${ctx.provider.url}/send`, { method: 'POST', body: JSON.stringify({}) });

  expect(ctx.provider.calls).toStrictEqual([{ idempotencyKey: null, body: {} }]);
});

test('it answers a success with a 200 and the result', async () => {
  const ctx = setupTest();

  ctx.provider.addReplies({ kind: 'success', result: { delivered: true } });

  const response = await fetch(`${ctx.provider.url}/send`, { method: 'POST', body: '{}' });

  expect(response.status).toBe(200);
  const body: unknown = await response.json();

  expect(body).toStrictEqual({ result: { delivered: true } });
});

test('it answers a refusal that can clear with a 429 and its retry time', async () => {
  const ctx = setupTest();

  ctx.provider.addReplies({
    kind: 'refused_retryable',
    reason: 'rate limited',
    retryAfterMs: 5000,
  });

  const response = await fetch(`${ctx.provider.url}/send`, { method: 'POST', body: '{}' });

  expect(response.status).toBe(429);
  expect(response.headers.get('retry-after-ms')).toBe('5000');
  const body: unknown = await response.json();

  expect(body).toStrictEqual({ reason: 'rate limited' });
});

test('it answers a refusal with a 422 and its reason', async () => {
  const ctx = setupTest();

  ctx.provider.addReplies({ kind: 'refused', reason: 'no such address' });

  const response = await fetch(`${ctx.provider.url}/send`, { method: 'POST', body: '{}' });

  expect(response.status).toBe(422);
  const body: unknown = await response.json();

  expect(body).toStrictEqual({ reason: 'no such address' });
});

test('it records a dropped call, then closes the connection before it answers', async () => {
  const ctx = setupTest();

  ctx.provider.addReplies({ kind: 'drop' });

  await expect(fetch(`${ctx.provider.url}/send`, { method: 'POST', body: '{}' })).toReject();
  expect(ctx.provider.calls).toHaveLength(1);
});

test('it refuses a call past the end of its script', async () => {
  const ctx = setupTest();

  const response = await fetch(`${ctx.provider.url}/send`, { method: 'POST', body: '{}' });

  expect(response.status).toBe(422);
  const body: unknown = await response.json();

  expect(body).toStrictEqual({ reason: 'the provider double has no reply left' });
});

test('it holds a gated answer until its gate resolves, and records the call at once', async () => {
  const ctx = setupTest();
  const gate = Promise.withResolvers<void>();

  ctx.provider.addReplies({ kind: 'success', result: {}, gate: gate.promise });

  const response = fetch(`${ctx.provider.url}/send`, { method: 'POST', body: '{}' });

  await waitForCondition(() => ctx.provider.calls.length === 1);

  const statusBeforeGate = Bun.peek.status(response);

  gate.resolve();

  const answered = await response;

  expect(statusBeforeGate).toBe('pending');
  expect(answered.status).toBe(200);
});
