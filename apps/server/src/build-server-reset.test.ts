import { expect, mock, test } from 'bun:test';
import { defaultAPISettings } from '@heynixie/api';
import { buildCleanup } from './build-cleanup';
import { buildServerReset } from './build-server-reset';
import { runTestSeed } from './test-utils/run-test-seed';
import { startTestServer } from './test-utils/start-test-server';

// a test server and the cleanup of the work its start sequence started; boot data: a reset needs
// definitions in force, which every start seeds
async function setupTest() {
  const server = await startTestServer();

  await runTestSeed(server.context.log, server.dataDir);
  return {
    ...server,
    context: { ...server.context, settings: defaultAPISettings },
    work: buildCleanup(),
  };
}

test('it ends the start and stops its work before it resets', async () => {
  const ctx = await setupTest();
  const stopRunners = mock(() => Promise.resolve());

  await ctx.work.defer(stopRunners);

  const answer = await buildServerReset({
    context: ctx.context,
    adapter: ctx.sandboxes,
    work: ctx.work,
    readStart: () => Promise.resolve(),
    log: mock(),
    onFailure: mock(),
  }).run();

  expect(ctx.work.signal.aborted).toBeTrue();
  expect(stopRunners).toHaveBeenCalledOnce();
  expect(answer).toStrictEqual({
    resetAt: expect.toBeValidDate(),
    lastSequence: 1,
    keptSessions: 0,
  });
});

test('it logs the reset and resolves done once the reset finishes', async () => {
  const ctx = await setupTest();
  const log = mock();
  const reset = buildServerReset({
    context: ctx.context,
    adapter: ctx.sandboxes,
    work: ctx.work,
    readStart: () => Promise.resolve(),
    log,
    onFailure: mock(),
  });

  await reset.run();

  expect(Bun.peek.status(reset.done)).toBe('fulfilled');
  expect(log.mock.calls).toStrictEqual([
    ['reset.started'],
    ['reset.finished', { lastSequence: 1, keptSessions: 0 }],
  ]);
});

test('it answers a request that arrives while a reset runs with that reset', async () => {
  const ctx = await setupTest();
  const reset = buildServerReset({
    context: ctx.context,
    adapter: ctx.sandboxes,
    work: ctx.work,
    readStart: () => Promise.resolve(),
    log: mock(),
    onFailure: mock(),
  });

  const first = reset.run();
  const second = reset.run();

  await Promise.allSettled([first, second]);

  expect(second).toBe(first);
});

test('it reports a failed reset as the server failing, and never resolves done', async () => {
  const ctx = await setupTest();
  const onFailure = mock();

  await ctx.work.defer(() => Promise.reject(new Error('the runners failed to stop')));

  const reset = buildServerReset({
    context: ctx.context,
    adapter: ctx.sandboxes,
    work: ctx.work,
    readStart: () => Promise.resolve(),
    log: mock(),
    onFailure,
  });
  const run = reset.run();

  await Promise.allSettled([run]);

  expect(run).rejects.toThrowWithMessage(AggregateError, 'a part failed to stop');
  expect(onFailure).toHaveBeenCalledExactlyOnceWith(expect.any(AggregateError));
  expect(Bun.peek.status(reset.done)).toBe('pending');
});

test('it logs a failed reset with the error', async () => {
  const ctx = await setupTest();
  const log = mock();

  await ctx.work.defer(() => Promise.reject(new Error('the runners failed to stop')));

  const run = buildServerReset({
    context: ctx.context,
    adapter: ctx.sandboxes,
    work: ctx.work,
    readStart: () => Promise.resolve(),
    log,
    onFailure: mock(),
  }).run();

  await Promise.allSettled([run]);

  expect(log.mock.calls).toStrictEqual([
    ['reset.started'],
    ['reset.failed', { error: 'AggregateError', message: 'a part failed to stop' }],
  ]);
});

test('it waits for a reset in flight to settle, and never rejects with its failure', async () => {
  const ctx = await setupTest();

  await ctx.work.defer(() => Promise.reject(new Error('the runners failed to stop')));

  const reset = buildServerReset({
    context: ctx.context,
    adapter: ctx.sandboxes,
    work: ctx.work,
    readStart: () => Promise.resolve(),
    log: mock(),
    onFailure: mock(),
  });
  const run = reset.run();

  await reset.waitForSettled();

  expect(Bun.peek.status(run)).toBe('rejected');
});
