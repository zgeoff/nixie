import { expect, mock, test } from 'bun:test';
import type { Logger } from '@heynixie/logger';
import { waitForCondition } from '@heynixie/testing';
import { startTestSpend } from '../test-utils';
import { patchLimitUntilSet } from './patch-limit-until-set';

async function setupTest() {
  const spend = await startTestSpend();

  const logger = mock<Logger>(() => {});

  return {
    ...spend,
    logger,
    patch: (signal?: AbortSignal) =>
      patchLimitUntilSet(
        spend.context,
        { sandbox: 'sandbox-1', limit: { dollars: 4 } },
        { retryMs: 5000, logger, ...(signal === undefined ? {} : { signal }) },
      ),
  };
}

test('it sets the limit with one call when the gateway answers', async () => {
  const ctx = await setupTest();
  const outcome = await ctx.patch();

  expect(outcome).toBe('set');
  expect(ctx.gateway.patchSandbox.mock.calls).toStrictEqual([['sandbox-1', { dollars: 4 }]]);
});

test('it goes again after the retry delay when the gateway did not answer', async () => {
  const ctx = await setupTest();

  ctx.gateway.patchSandbox.mockResolvedValueOnce({ kind: 'unreachable', reason: 'no answer' });

  const patching = ctx.patch();

  await waitForCondition(() => ctx.clock.countPending() === 1);

  ctx.clock.advance(5000);

  const outcome = await patching;

  expect(outcome).toBe('set');
  expect(ctx.gateway.patchSandbox.mock.calls).toHaveLength(2);

  expect(ctx.logger.mock.calls).toStrictEqual([
    ['spend.sandbox_limit_unset', { sandboxID: 'sandbox-1', reason: 'no answer' }, 'warn'],
  ]);
});

test('it stops for a sandbox the gateway no longer holds', async () => {
  const ctx = await setupTest();

  ctx.gateway.patchSandbox.mockResolvedValue({ kind: 'not_found' });

  const outcome = await ctx.patch();

  expect(outcome).toBe('gone');
  expect(ctx.gateway.patchSandbox.mock.calls).toHaveLength(1);
});

test('it stops when the signal aborts while the gateway does not answer', async () => {
  const ctx = await setupTest();

  const controller = new AbortController();

  ctx.gateway.patchSandbox.mockResolvedValue({ kind: 'unreachable', reason: 'no answer' });

  const patching = ctx.patch(controller.signal);

  await waitForCondition(() => ctx.clock.countPending() === 1);

  controller.abort();

  const outcome = await patching;

  expect(outcome).toBe('stopped');
});
