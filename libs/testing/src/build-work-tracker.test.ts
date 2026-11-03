import { expect, test } from 'bun:test';
import { buildWorkTracker } from './build-work-tracker';

test('it reports settled with no work running', () => {
  const tracker = buildWorkTracker();

  expect(tracker.isSettled()).toBeTrue();
});

test('it reports unsettled while a work runs, and settled once it ends', async () => {
  const tracker = buildWorkTracker();
  const claim = Promise.withResolvers<void>();
  const work = tracker.runWork(() => claim.promise);
  const settledWhileRunning = tracker.isSettled();

  claim.resolve();

  await work;

  expect({ settledWhileRunning, settledAfter: tracker.isSettled() }).toStrictEqual({
    settledWhileRunning: false,
    settledAfter: true,
  });
});

test('it reports settled once a work that throws ends', () => {
  const tracker = buildWorkTracker();

  const work = tracker.runWork(async () => {
    await Promise.resolve();

    throw new Error('the claim failed');
  });

  expect(work).rejects.toThrow('the claim failed');
  expect(tracker.isSettled()).toBeTrue();
});

test('it counts a work parked on a wait as settled, and running again once the wait ends', async () => {
  const tracker = buildWorkTracker();
  const hold = Promise.withResolvers<void>();
  const rest = Promise.withResolvers<void>();
  const parked = Promise.withResolvers<void>();
  const resumed = Promise.withResolvers<void>();

  const work = tracker.runWork(async () => {
    const wait = tracker.runParked(() => hold.promise);

    parked.resolve();

    await wait;

    resumed.resolve();

    await rest.promise;
  });

  await parked.promise;

  const settledWhileParked = tracker.isSettled();

  hold.resolve();

  await resumed.promise;

  const settledAfterRelease = tracker.isSettled();

  rest.resolve();

  await work;

  expect({ settledWhileParked, settledAfterRelease }).toStrictEqual({
    settledWhileParked: true,
    settledAfterRelease: false,
  });
});

test('it keeps a parked work unsettled while a work it started still runs', async () => {
  const tracker = buildWorkTracker();
  const hold = Promise.withResolvers<void>();
  const read = Promise.withResolvers<void>();
  const started = Promise.withResolvers<void>();

  const work = tracker.runWork(async () => {
    const nested = tracker.runWork(() => read.promise);

    started.resolve();

    await tracker.runParked(() => hold.promise);

    await nested;
  });

  await started.promise;

  const settled = tracker.isSettled();

  read.resolve();
  hold.resolve();

  await work;

  expect(settled).toBeFalse();
});

test('it runs a wait outside any work without a change to the state', async () => {
  const tracker = buildWorkTracker();
  const claim = Promise.withResolvers<void>();
  const work = tracker.runWork(() => claim.promise);
  const hold = Promise.withResolvers<void>();
  const wait = tracker.runParked(() => hold.promise);
  const settled = tracker.isSettled();

  hold.resolve();
  claim.resolve();

  await Promise.all([wait, work]);

  expect(settled).toBeFalse();
});
