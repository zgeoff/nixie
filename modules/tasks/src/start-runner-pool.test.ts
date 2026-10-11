import { expect, mock, onTestFinished, test } from 'bun:test';
import { buildTestClock, waitForCondition } from '@heynixie/testing';
import { setFaultPointHandler } from './set-fault-point-handler';
import { startRunnerPool } from './start-runner-pool';

// a queue of work whose runs each hold until the test releases them
function setupTest(work: readonly string[]) {
  const clock = buildTestClock(0);
  const queue = [...work];
  const running = new Map<string, () => void>();
  const finished: string[] = [];
  const peak = { running: 0 };
  const claim = mock(() => Promise.resolve(queue.shift() ?? null));
  const run = async (item: string): Promise<void> => {
    const held = Promise.withResolvers<void>();

    running.set(item, held.resolve);
    peak.running = Math.max(peak.running, running.size);
    await held.promise;
    running.delete(item);
    finished.push(item);
  };
  const emitReleases = (): void => {
    for (const release of running.values()) {
      release();
    }
  };

  return { clock, queue, running, finished, peak, claim, run, emitReleases };
}

test('it runs no more work at once than its size', async () => {
  const ctx = setupTest(['a', 'b', 'c', 'd', 'e']);
  const pool = startRunnerPool(ctx.clock, {
    size: 2,
    pollMs: 1000,
    claim: ctx.claim,
    run: ctx.run,
    onError: () => {},
  });

  onTestFinished(() => pool.stop(0));
  await waitForCondition(() => ctx.running.size === 2);
  ctx.emitReleases();
  await waitForCondition(() => ctx.running.size === 2 && ctx.finished.length === 2);
  ctx.emitReleases();
  await waitForCondition(() => ctx.finished.length === 4).then(ctx.emitReleases);

  await waitForCondition(() => ctx.finished.length === 5);
  expect(ctx.peak.running).toBe(2);
});

test('it claims again after the poll interval when no work was claimable', async () => {
  const ctx = setupTest([]);
  const pool = startRunnerPool(ctx.clock, {
    size: 1,
    pollMs: 1000,
    claim: ctx.claim,
    run: ctx.run,
    onError: () => {},
  });

  onTestFinished(() => pool.stop(0));
  await waitForCondition(() => ctx.clock.countSleepers() === 1);
  ctx.queue.push('a');
  ctx.clock.advance(1000);

  await waitForCondition(() => ctx.running.has('a'));
  expect(ctx.claim).toHaveBeenCalledTimes(2);
  ctx.emitReleases();
});

test('it claims at once when woken', async () => {
  const ctx = setupTest([]);
  const pool = startRunnerPool(ctx.clock, {
    size: 1,
    pollMs: 1000,
    claim: ctx.claim,
    run: ctx.run,
    onError: () => {},
  });

  onTestFinished(() => pool.stop(0));
  await waitForCondition(() => ctx.clock.countSleepers() === 1);
  ctx.queue.push('a');

  pool.wake();

  await waitForCondition(() => ctx.running.has('a'));
  expect(ctx.clock.now()).toBe(0);
  ctx.emitReleases();
});

test('it claims nothing after a stop, and waits for the work in flight', async () => {
  const ctx = setupTest(['a', 'b']);
  const pool = startRunnerPool(ctx.clock, {
    size: 1,
    pollMs: 1000,
    claim: ctx.claim,
    run: ctx.run,
    onError: () => {},
  });

  await waitForCondition(() => ctx.running.has('a'));

  const stopped = pool.stop();

  ctx.emitReleases();
  await stopped;

  expect(ctx.finished).toStrictEqual(['a']);
  expect(ctx.queue).toStrictEqual(['b']);
});

test('it stops waiting for work in flight at the grace deadline', async () => {
  const ctx = setupTest(['a']);
  const pool = startRunnerPool(ctx.clock, {
    size: 1,
    pollMs: 1000,
    claim: ctx.claim,
    run: ctx.run,
    onError: () => {},
  });

  onTestFinished(ctx.emitReleases);
  await waitForCondition(() => ctx.running.has('a'));

  const stopped = pool.stop(30_000);

  await waitForCondition(() => ctx.clock.countSleepers() === 1);
  ctx.clock.advance(30_000);
  await stopped;

  expect(ctx.finished).toStrictEqual([]);
});

test('it reaches sigterm.grace when a stop finds work in flight', async () => {
  const ctx = setupTest(['a']);
  const reached: string[] = [];

  setFaultPointHandler((id) => {
    reached.push(id);
  });
  onTestFinished(() => {
    setFaultPointHandler(null);
  });

  const pool = startRunnerPool(ctx.clock, {
    size: 1,
    pollMs: 1000,
    claim: ctx.claim,
    run: ctx.run,
    onError: () => {},
  });

  await waitForCondition(() => ctx.running.has('a'));

  const stopped = pool.stop();

  ctx.emitReleases();
  await stopped;

  expect(reached).toStrictEqual(['sigterm.grace']);
});

test('it reports an error a run threw and stops claiming', async () => {
  const ctx = setupTest(['a', 'b']);
  const onError = mock<(error: unknown) => void>();
  const failure = new Error('writer epoch 1 is stale: the database holds writer epoch 2');
  const pool = startRunnerPool(ctx.clock, {
    size: 1,
    pollMs: 1000,
    claim: ctx.claim,
    run: () => Promise.reject(failure),
    onError,
  });

  onTestFinished(() => pool.stop(0));

  await waitForCondition(() => onError.mock.calls.length === 1);
  expect(onError).toHaveBeenCalledExactlyOnceWith(failure);
  expect(ctx.queue).toStrictEqual(['b']);
});
