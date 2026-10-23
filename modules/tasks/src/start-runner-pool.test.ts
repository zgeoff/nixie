import { expect, mock, onTestFinished, test } from 'bun:test';
import { buildTestClock, waitForCondition } from '@heynixie/testing';
import { setFaultPointHandler } from './set-fault-point-handler';
import { startRunnerPool } from './start-runner-pool';
import { buildStubPoolWork } from './test-utils/build-stub-pool-work';

function setupTest() {
  return { clock: buildTestClock(0) };
}

test('it runs no more work at once than its size', async () => {
  const work = buildStubPoolWork(['a', 'b', 'c', 'd', 'e']);

  const pool = startRunnerPool(buildTestClock(0), {
    size: 2,
    pollMs: 1000,
    claim: work.claim,
    run: work.run,
    onError: () => {},
  });

  onTestFinished(() => pool.stop(0));

  await waitForCondition(() => work.running.size === 2);

  work.releaseAll();

  await waitForCondition(() => work.running.size === 2 && work.finished.length === 2);

  work.releaseAll();

  await waitForCondition(() => work.finished.length === 4).then(work.releaseAll);
  await waitForCondition(() => work.finished.length === 5);

  expect(work.peak.running).toBe(2);
});

test('it claims again after the poll interval when no work was claimable', async () => {
  const ctx = setupTest();
  const work = buildStubPoolWork([]);
  const claim = mock(work.claim);

  const pool = startRunnerPool(ctx.clock, {
    size: 1,
    pollMs: 1000,
    claim,
    run: work.run,
    onError: () => {},
  });

  onTestFinished(async () => {
    work.releaseAll();

    await pool.stop(0);
  });

  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  work.queue.push('a');
  ctx.clock.advance(1000);

  await waitForCondition(() => work.running.has('a'));

  expect(claim).toHaveBeenCalledTimes(2);
});

test('it claims at once when woken', async () => {
  const ctx = setupTest();
  const work = buildStubPoolWork([]);

  const pool = startRunnerPool(ctx.clock, {
    size: 1,
    pollMs: 1000,
    claim: work.claim,
    run: work.run,
    onError: () => {},
  });

  onTestFinished(async () => {
    work.releaseAll();

    await pool.stop(0);
  });

  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  work.queue.push('a');
  pool.wake();

  await waitForCondition(() => work.running.has('a'));

  expect(ctx.clock.now()).toBe(0);
});

test('it claims again at once when a wake lands during a claim that found nothing', async () => {
  const ctx = setupTest();
  const work = buildStubPoolWork([]);
  const miss = work.holdNextMiss();

  const pool = startRunnerPool(ctx.clock, {
    size: 1,
    pollMs: 1000,
    claim: work.claim,
    run: work.run,
    onError: () => {},
  });

  onTestFinished(async () => {
    work.releaseAll();

    await pool.stop(0);
  });

  await miss.started;

  work.queue.push('a');
  pool.wake();
  miss.release();

  await waitForCondition(() => work.running.has('a'));

  expect(ctx.clock.now()).toBe(0);
});

test('it claims again at once when the poll interval passed during a claim that found nothing', async () => {
  const ctx = setupTest();
  const work = buildStubPoolWork([]);
  const miss = work.holdNextMiss();

  const pool = startRunnerPool(ctx.clock, {
    size: 1,
    pollMs: 1000,
    claim: work.claim,
    run: work.run,
    onError: () => {},
  });

  onTestFinished(async () => {
    work.releaseAll();

    await pool.stop(0);
  });

  await miss.started;

  work.queue.push('a');
  ctx.clock.advance(1000);
  miss.release();

  await waitForCondition(() => work.running.has('a'));

  expect(ctx.clock.now()).toBe(1000);
});

test('it claims nothing after a stop, and waits for the work in flight', async () => {
  const ctx = setupTest();
  const work = buildStubPoolWork(['a', 'b']);

  const pool = startRunnerPool(ctx.clock, {
    size: 1,
    pollMs: 1000,
    claim: work.claim,
    run: work.run,
    onError: () => {},
  });

  onTestFinished(() => pool.stop(0));

  await waitForCondition(() => work.running.has('a'));

  const stopped = pool.stop();

  work.releaseAll();

  await stopped;

  expect(work.finished).toStrictEqual(['a']);
  expect(work.queue).toStrictEqual(['b']);
});

test('it stops waiting for work in flight at the grace deadline', async () => {
  const ctx = setupTest();
  const work = buildStubPoolWork(['a']);

  const pool = startRunnerPool(ctx.clock, {
    size: 1,
    pollMs: 1000,
    claim: work.claim,
    run: work.run,
    onError: () => {},
  });

  onTestFinished(work.releaseAll);

  await waitForCondition(() => work.running.has('a'));

  const stopped = pool.stop(30_000);

  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  ctx.clock.advance(30_000);

  await stopped;

  expect(work.finished).toStrictEqual([]);
});

test('it reaches sigterm.grace when a stop finds work in flight', async () => {
  const ctx = setupTest();
  const work = buildStubPoolWork(['a']);
  const reached: string[] = [];

  setFaultPointHandler((id) => {
    reached.push(id);
    work.releaseAll();
  });

  onTestFinished(() => {
    setFaultPointHandler(null);
  });

  const pool = startRunnerPool(ctx.clock, {
    size: 1,
    pollMs: 1000,
    claim: work.claim,
    run: work.run,
    onError: () => {},
  });

  onTestFinished(() => pool.stop(0));

  await waitForCondition(() => work.running.has('a'));

  await pool.stop();

  expect(reached).toStrictEqual(['sigterm.grace']);
});

test('it runs no work whose claim committed after a stop began', async () => {
  const claimed = Promise.withResolvers<string | null>();
  const claim = mock(() => claimed.promise);
  const run = mock(() => Promise.resolve());

  const pool = startRunnerPool(buildTestClock(0), {
    size: 1,
    pollMs: 1000,
    claim,
    run,
    onError: () => {},
  });

  onTestFinished(() => pool.stop(0));

  await waitForCondition(() => claim.mock.calls.length === 1);

  const stopped = pool.stop();

  claimed.resolve('a');

  await stopped;

  expect(run).not.toHaveBeenCalled();
});

test('it reports an error a run threw and stops claiming', async () => {
  const ctx = setupTest();
  const work = buildStubPoolWork(['a', 'b']);
  const onError = mock<(error: unknown) => void>();

  const failure = new Error('writer epoch 1 is stale: the database holds writer epoch 2');

  const pool = startRunnerPool(ctx.clock, {
    size: 1,
    pollMs: 1000,
    claim: work.claim,
    run: () => Promise.reject(failure),
    onError,
  });

  onTestFinished(() => pool.stop(0));

  await waitForCondition(() => onError.mock.calls.length === 1);

  expect(onError).toHaveBeenCalledExactlyOnceWith(failure);
  expect(work.queue).toStrictEqual(['b']);
});
