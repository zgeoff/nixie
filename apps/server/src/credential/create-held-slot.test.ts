import { expect, test } from 'bun:test';
import { createInMemoryHeldBackend } from '@heynixie/credentials/test-utils';
import { createHeldSlot } from './create-held-slot';

function setupTest() {
  const recorder = {
    write: () => Promise.resolve(),
    readOpenRefreshes: () => Promise.resolve([]),
  };

  const buildWiring = () => ({
    backend: { ...createInMemoryHeldBackend({ recorder }), sweepKeys: () => Promise.resolve([]) },
    recorder,
  });

  return { slot: createHeldSlot(), buildWiring };
}

test('it gives back the wiring that the connections part bound', () => {
  const ctx = setupTest();
  const bound = ctx.slot.bind(ctx.buildWiring);

  expect(ctx.slot.read()).toBe(bound);
});

test('it gives a second bind the wiring of the first, so a retried start shares its backend', () => {
  const ctx = setupTest();
  const first = ctx.slot.bind(ctx.buildWiring);
  const second = ctx.slot.bind(ctx.buildWiring);

  expect([second === first, ctx.slot.read() === first]).toStrictEqual([true, true]);
});

test('it refuses a read before the wiring is bound', () => {
  const ctx = setupTest();

  expect(() => ctx.slot.read()).toThrow(/binds the database backend/u);
});
