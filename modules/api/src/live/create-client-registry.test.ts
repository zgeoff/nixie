import { expect, test } from 'bun:test';
import { createFakeClock } from '@zgeoff/testing/clock';
import { createClientRegistry } from './create-client-registry';

function setupTest() {
  const clock = createFakeClock({ startMs: 1_000_000 });

  return { clock, registry: createClientRegistry({ clock }) };
}

test('#createClientRegistry holds nobody present before any session shows nixie', () => {
  const ctx = setupTest();

  expect(ctx.registry.presence.isPresent(120_000)).toBeFalse();
});

test('#createClientRegistry holds a session present within the window of its newest beat', () => {
  const ctx = setupTest();

  ctx.registry.recordShown('session-a');
  ctx.clock.advance(120_000);

  expect(ctx.registry.presence.isPresent(120_000)).toBeTrue();
});

test('#createClientRegistry holds a session absent once its newest beat is older than the window', () => {
  const ctx = setupTest();

  ctx.registry.recordShown('session-a');
  ctx.clock.advance(120_001);

  expect(ctx.registry.presence.isPresent(120_000)).toBeFalse();
});

test('#createClientRegistry keeps a session present by its newest beat when an older one lapsed', () => {
  const ctx = setupTest();

  ctx.registry.recordShown('session-a');
  ctx.clock.advance(100_000);
  ctx.registry.recordShown('session-b');
  ctx.clock.advance(100_000);

  expect(ctx.registry.presence.isPresent(120_000)).toBeTrue();
});
