import { expect, mock, test } from 'bun:test';
import type { Logger } from '@heynixie/logger';
import { waitForCondition } from '@heynixie/testing';
import { startTestSpend } from '../test-utils';
import { patchLimitUntilSet } from './patch-limit-until-set';
import { withSandboxLimitLock } from './with-sandbox-limit-lock';

async function setupTest() {
  const spend = await startTestSpend();

  const logger = mock<Logger>(() => {});

  const readLimit = mock<() => Promise<{ limit: { dollars: number } } | null>>(() =>
    Promise.resolve({ limit: { dollars: 4 } }),
  );

  return {
    ...spend,
    logger,
    readLimit,
    patch: (signal?: AbortSignal) =>
      patchLimitUntilSet(
        spend.context,
        { sandbox: 'sandbox-1', readLimit },
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

test('it sets the limit as it stands at the retry, and not the one it began with', async () => {
  const ctx = await setupTest();

  ctx.gateway.patchSandbox.mockResolvedValueOnce({ kind: 'unreachable', reason: 'no answer' });

  const patching = ctx.patch();

  await waitForCondition(() => ctx.clock.countPending() === 1);

  ctx.readLimit.mockResolvedValue({ limit: { dollars: 3 } });
  ctx.clock.advance(5000);

  await patching;

  expect(ctx.gateway.patchSandbox.mock.calls).toStrictEqual([
    ['sandbox-1', { dollars: 4 }],
    ['sandbox-1', { dollars: 3 }],
  ]);
});

test('it sets nothing more once a newer limit has replaced its own', async () => {
  const ctx = await setupTest();

  ctx.gateway.patchSandbox.mockResolvedValueOnce({ kind: 'unreachable', reason: 'no answer' });

  const patching = ctx.patch();

  await waitForCondition(() => ctx.clock.countPending() === 1);

  ctx.readLimit.mockResolvedValue(null);
  ctx.clock.advance(5000);

  const outcome = await patching;

  expect(outcome).toBe('stale');
  expect(ctx.gateway.patchSandbox.mock.calls).toHaveLength(1);
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

test('it holds a limit that a step sets after its check until the gateway answered the patch', async () => {
  const ctx = await setupTest();

  const answer = Promise.withResolvers<{ kind: 'ok' }>();
  const events: string[] = [];

  ctx.gateway.patchSandbox.mockImplementationOnce(async () => {
    const done = await answer.promise;

    events.push('retry answered');

    return done;
  });

  ctx.gateway.patchSandbox.mockImplementationOnce(() => {
    events.push('step limit sent');

    return Promise.resolve({ kind: 'ok' });
  });

  const patching = ctx.patch();

  await waitForCondition(() => ctx.gateway.patchSandbox.mock.calls.length === 1);

  const stepWrite = withSandboxLimitLock('sandbox-1', () =>
    ctx.gateway.patchSandbox('sandbox-1', { dollars: 1 }),
  );

  answer.resolve({ kind: 'ok' });

  await Promise.all([patching, stepWrite]);

  expect(events).toStrictEqual(['retry answered', 'step limit sent']);
});
