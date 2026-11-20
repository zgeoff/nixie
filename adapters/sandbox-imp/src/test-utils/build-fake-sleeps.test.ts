import { expect, onTestFinished, test } from 'bun:test';
import { waitForCondition } from '@heynixie/testing';
import { buildFakeSleeps } from './build-fake-sleeps';
import { startImpd } from './start-impd';

async function setupTest() {
  const impd = await startImpd();

  onTestFinished(impd.stop);

  await impd.seedImage('harbour-image');
  await impd.client.imps.create({ name: 'harbour', image: 'harbour-image' });

  return { impd, sleeps: buildFakeSleeps(impd.client) };
}

test('it holds an exec until the idle sleep ends, then wakes the imp for that exec', async () => {
  const ctx = await setupTest();

  const snapshot = Promise.withResolvers<void>();

  void ctx.sleeps.startIdleSleep('harbour', snapshot.promise);
  const waiting = ctx.sleeps.waitForAwake('harbour');

  snapshot.resolve();

  await waiting;

  const imp = await ctx.impd.client.imps.get({ name: 'harbour' });

  expect(ctx.sleeps.events).toStrictEqual(['wait exec harbour', 'woken by exec harbour']);
  expect(imp.state).toBe('running');
});

test('it lets an exec through at once when no sleep holds the imp', async () => {
  const ctx = await setupTest();

  await ctx.sleeps.waitForAwake('harbour');

  expect(ctx.sleeps.events).toStrictEqual([]);
});

test('it holds the adapter wake until the idle sleep ends', async () => {
  const ctx = await setupTest();

  const snapshot = Promise.withResolvers<void>();

  const guarded = ctx.sleeps.guardWake({
    wakeImp: async (name) => {
      await ctx.impd.client.requireAwake(name);
    },
  });

  void ctx.sleeps.startIdleSleep('harbour', snapshot.promise);
  const waking = guarded.wakeImp('harbour');

  snapshot.resolve();

  await waking;

  const imp = await ctx.impd.client.imps.get({ name: 'harbour' });

  await ctx.sleeps.waitForAwake('harbour');

  expect(ctx.sleeps.events).toStrictEqual(['wait wake harbour']);
  expect(imp.state).toBe('running');
});

test('it starts the sleep set for the next wake once, and none after it', async () => {
  const ctx = await setupTest();

  const guarded = ctx.sleeps.guardWake({
    wakeImp: async (name) => {
      await ctx.impd.client.requireAwake(name);
    },
  });

  ctx.sleeps.sleepsAfterWake.set('harbour', Promise.resolve());

  await guarded.wakeImp('harbour');
  await ctx.sleeps.waitForAwake('harbour');
  await guarded.wakeImp('harbour');

  expect(ctx.sleeps.events).toStrictEqual(['wait exec harbour', 'woken by exec harbour']);
});

test('it ends an idle sleep only once the reverse forwards of the imp have ended', async () => {
  const ctx = await setupTest();

  const snapshot = Promise.withResolvers<void>();
  const ended = Promise.withResolvers<{ kind: string }>();
  const order: string[] = [];

  const tracked = ctx.sleeps.trackForwards({
    openReverseForward: () => ({
      listening: Promise.resolve(),
      ended: ended.promise,
      stop: () => {},
    }),
  });

  tracked.openReverseForward('harbour', 4100, () => {});

  const sleeping = (async () => {
    await ctx.sleeps.startIdleSleep('harbour', snapshot.promise);

    order.push('slept');
  })();

  snapshot.resolve();

  await waitForCondition(async () => {
    const imp = await ctx.impd.client.imps.get({ name: 'harbour' });

    return imp.state === 'sleeping';
  });

  order.push('forward ended');
  ended.resolve({ kind: 'closed' });

  await sleeping;

  expect(order).toStrictEqual(['forward ended', 'slept']);
});
