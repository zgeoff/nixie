import { expect, test } from 'bun:test';
import { startTestCoding } from '../test-utils/start-test-coding';
import { buildStartCursorStore } from './build-start-cursor-store';

async function setupTest() {
  const ctx = await startTestCoding();

  const clock = { nowMs: 1_000_000 };

  return {
    ...ctx,
    clock,
    buildStore: (adapterID: string) =>
      buildStartCursorStore(ctx.coding, adapterID, () => clock.nowMs),
  };
}

test('it reads null for a key that has no cursor', async () => {
  const ctx = await setupTest();
  const cursor = await ctx.buildStore('atc').read('action-1');

  expect(cursor).toBeNull();
});

test('it reads the cursor written under a key from a store built again, as after a restart', async () => {
  const ctx = await setupTest();

  await ctx.buildStore('atc').write('action-1', 'g0');

  const cursor = await ctx.buildStore('atc').read('action-1');

  expect(cursor).toBe('g0');
});

test('it keeps the first cursor written under a key', async () => {
  const ctx = await setupTest();

  const store = ctx.buildStore('atc');

  await store.write('action-1', 'g0');
  await store.write('action-1', 'g5');

  const cursor = await store.read('action-1');

  expect(cursor).toBe('g0');
});

test('it keeps the cursors of one adapter apart from those of another', async () => {
  const ctx = await setupTest();

  await ctx.buildStore('atc').write('action-1', 'g0');

  const cursor = await ctx.buildStore('other').read('action-1');

  expect(cursor).toBeNull();
});

test('it removes the cursor of a key and no other', async () => {
  const ctx = await setupTest();

  const store = ctx.buildStore('atc');

  await store.write('action-1', 'g0');
  await store.write('action-2', 'g3');
  await store.remove('action-1');

  const cursors = [await store.read('action-1'), await store.read('action-2')];

  expect(cursors).toStrictEqual([null, 'g3']);
});

test('it drops the cursors that are more than a day old when it writes another', async () => {
  const ctx = await setupTest();

  const store = ctx.buildStore('atc');

  await store.write('action-1', 'g0');

  ctx.clock.nowMs += 24 * 60 * 60 * 1000 + 1;

  await store.write('action-2', 'g9');

  const cursors = [await store.read('action-1'), await store.read('action-2')];

  expect(cursors).toStrictEqual([null, 'g9']);
});
