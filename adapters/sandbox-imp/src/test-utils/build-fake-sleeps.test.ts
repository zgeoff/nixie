import { expect, onTestFinished, test } from 'bun:test';
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
