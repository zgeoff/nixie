import { expect, test } from 'bun:test';
import { waitForCondition } from '@heynixie/testing';
import { withSandboxLimitLock } from './with-sandbox-limit-lock';

test('it runs a second write of a sandbox only after the first has finished', async () => {
  const events: string[] = [];
  const gate = Promise.withResolvers<void>();

  const first = withSandboxLimitLock('sandbox-1', async () => {
    events.push('first start');

    await gate.promise;

    events.push('first end');
  });

  const second = withSandboxLimitLock('sandbox-1', () => {
    events.push('second start');

    return Promise.resolve();
  });

  await waitForCondition(() => events.length === 1);

  gate.resolve();

  await Promise.all([first, second]);

  expect(events).toStrictEqual(['first start', 'first end', 'second start']);
});

test('it runs the writes of two sandboxes together', async () => {
  const gate = Promise.withResolvers<void>();
  const started: string[] = [];

  const first = withSandboxLimitLock('sandbox-1', async () => {
    started.push('sandbox-1');

    await gate.promise;
  });

  const second = withSandboxLimitLock('sandbox-2', async () => {
    started.push('sandbox-2');

    await gate.promise;
  });

  await waitForCondition(() => started.length === 2);

  gate.resolve();

  await Promise.all([first, second]);

  expect(started).toStrictEqual(['sandbox-1', 'sandbox-2']);
});

test('it runs the next write after one that threw', async () => {
  const failed = withSandboxLimitLock('sandbox-1', () => Promise.reject(new Error('boom')));
  const next = withSandboxLimitLock('sandbox-1', () => Promise.resolve('ran'));

  await Promise.allSettled([failed]);

  const ran = await next;

  expect(ran).toBe('ran');
});
