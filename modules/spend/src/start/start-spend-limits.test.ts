import { expect, mock, onTestFinished, test } from 'bun:test';
import type { Logger } from '@heynixie/logger';
import { waitForCondition } from '@heynixie/testing';
import { buildMockGatewayStatus, buildStubSpendGateway } from '../test-utils';
import { startSpendLimits } from './start-spend-limits';

function setupTest() {
  const limits = {
    day: { dollars: 60, tokens: 80_000_000 },
    month: { dollars: 600, tokens: 600_000_000 },
  };

  const gateway = buildStubSpendGateway();
  const log = mock<Logger>(() => {});

  const stopping = new AbortController();

  onTestFinished(() => {
    stopping.abort();
  });

  const options = {
    gateway,
    limits,
    defaultZone: 'UTC',
    credentialCount: 0,
    pathProfileIDs: [],
    log,
    signal: stopping.signal,
    retryMs: 5,
  };

  return { gateway, log, limits, options };
}

test('it sends the limits when the gateway answers with the default zone', async () => {
  const ctx = setupTest();

  await startSpendLimits(ctx.options);

  expect(ctx.gateway.putLimits.mock.calls).toStrictEqual([[ctx.limits]]);
});

test('it refuses to start with a model credential and sends nothing', async () => {
  const ctx = setupTest();
  const started = startSpendLimits({ ...ctx.options, credentialCount: 2 });

  expect(started).rejects.toThrow(/model_credentials/u);

  await started.catch(() => {});

  expect(ctx.gateway.readStatus.mock.calls).toStrictEqual([]);
});

test('it refuses to start when the gateway zone differs from the default zone', async () => {
  const ctx = setupTest();

  ctx.gateway.readStatus.mockResolvedValue({
    kind: 'ok',
    value: buildMockGatewayStatus({ zone: 'Europe/London' }),
  });

  const started = startSpendLimits(ctx.options);

  expect(started).rejects.toThrow(/Europe\/London/u);

  await started.catch(() => {});

  expect(ctx.gateway.putLimits.mock.calls).toStrictEqual([]);
});

test('it refuses to start with the cap in the error when the gateway refuses the limits', () => {
  const ctx = setupTest();

  ctx.gateway.putLimits.mockResolvedValue({
    kind: 'above_cap',
    period: 'day',
    cap: { dollars: 50, tokens: 1000 },
  });

  expect(startSpendLimits(ctx.options)).rejects.toThrow(/cap of 50 dollars and 1000 tokens/u);
});

test('it starts and sends the limits once a gateway that gave no answer answers', async () => {
  const ctx = setupTest();

  ctx.gateway.readStatus.mockResolvedValueOnce({ kind: 'unreachable', reason: 'no answer' });

  await startSpendLimits(ctx.options);
  await waitForCondition(() => ctx.gateway.putLimits.mock.calls.length === 1);

  expect(ctx.gateway.putLimits.mock.calls).toStrictEqual([[ctx.limits]]);

  expect(ctx.log.mock.calls[0]).toStrictEqual([
    'spend.limits_unsent',
    { reason: 'no answer' },
    'warn',
  ]);
});

test('it sends no limits to a late gateway whose zone differs', async () => {
  const ctx = setupTest();

  ctx.gateway.readStatus
    .mockResolvedValueOnce({ kind: 'unreachable', reason: 'no answer' })
    .mockResolvedValue({ kind: 'ok', value: buildMockGatewayStatus({ zone: 'Asia/Tokyo' }) });

  await startSpendLimits(ctx.options);

  await waitForCondition(() =>
    ctx.log.mock.calls.some((call) => call[0] === 'spend.limits_refused'),
  );

  expect(ctx.gateway.putLimits.mock.calls).toStrictEqual([]);
});
