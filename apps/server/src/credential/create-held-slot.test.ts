import { expect, test } from 'bun:test';
import { createInMemoryHeldBackend } from '@heynixie/credentials/test-utils';
import { createHeldSlot } from './create-held-slot';

function setupTest() {
  const recorder = {
    write: () => Promise.resolve(),
    readOpenRefreshes: () => Promise.resolve([]),
  };

  const wiring = { backend: createInMemoryHeldBackend({ recorder }), recorder };

  return { slot: createHeldSlot(), wiring };
}

test('it gives back the wiring that the connections part bound', () => {
  const ctx = setupTest();

  ctx.slot.bind(ctx.wiring);

  expect(ctx.slot.read()).toBe(ctx.wiring);
});

test('it refuses a read before the wiring is bound', () => {
  const ctx = setupTest();

  expect(() => ctx.slot.read()).toThrow(/binds the database backend/u);
});
