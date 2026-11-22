import { expect, test } from 'bun:test';
import { createFakeClock } from '@zgeoff/testing/clock';
import { makeFetchBackoff } from './make-fetch-backoff';

function setupTest() {
  const clock = createFakeClock({ startMs: 1_000_000 });

  return { clock, backoff: makeFetchBackoff({ backoffMs: 30_000, backoffCapMs: 300_000, clock }) };
}

test('it reads no pause for a host that has none', () => {
  const ctx = setupTest();

  expect(ctx.backoff.readPause('example.com')).toBe(0);
});

test('it caps a pause at backoffCapMs', () => {
  const ctx = setupTest();

  ctx.backoff.setPause('example.com', 900_000);

  expect(ctx.backoff.readPause('example.com')).toBe(300_000);
});

test('it pauses for backoffMs when the reply names no wait', () => {
  const ctx = setupTest();

  ctx.backoff.setPause('example.com', null);

  expect(ctx.backoff.readPause('example.com')).toBe(30_000);
});

test('it sets no pause for a wait of 0', () => {
  const ctx = setupTest();

  ctx.backoff.setPause('example.com', 0);

  expect(ctx.backoff.readPause('example.com')).toBe(0);
});

test('it counts a pause down on the clock until it reaches 0', () => {
  const ctx = setupTest();

  ctx.backoff.setPause('example.com', 10_000);
  ctx.clock.advance(4000);

  expect(ctx.backoff.readPause('example.com')).toBe(6000);

  ctx.clock.advance(6000);

  expect(ctx.backoff.readPause('example.com')).toBe(0);
});

test('it never shortens a pause that is set already', () => {
  const ctx = setupTest();

  ctx.backoff.setPause('example.com', 20_000);
  ctx.backoff.setPause('example.com', 5000);

  expect(ctx.backoff.readPause('example.com')).toBe(20_000);
});

test('it keeps the pause of one host apart from another', () => {
  const ctx = setupTest();

  ctx.backoff.setPause('example.com', 20_000);

  expect(ctx.backoff.readPause('example.org')).toBe(0);
});

test('it empties the pause of every host on clear', () => {
  const ctx = setupTest();

  ctx.backoff.setPause('example.com', 20_000);
  ctx.backoff.setPause('example.org', 20_000);
  ctx.backoff.clear();

  expect([
    ctx.backoff.readPause('example.com'),
    ctx.backoff.readPause('example.org'),
  ]).toStrictEqual([0, 0]);
});
