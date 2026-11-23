import { expect, test } from 'bun:test';
import { waitForCondition } from '@heynixie/testing';
import { createFakeClock } from '@zgeoff/testing/clock';
import { makeHandover } from './make-handover';

interface Written {
  readonly kind: 'asked' | 'closed';
  readonly by?: string;
  readonly waitedSeconds?: number;
  readonly reason?: string;
}

function setupTest() {
  const clock = createFakeClock({ startMs: 1_000_000 });
  const written: Written[] = [];
  const held = { value: false };

  const handover = makeHandover({
    clock,
    logger: () => {},
    expiryMs: 60 * 60 * 1000,
    isHeld: () => held.value,
    records: {
      writeAsked: (input) => {
        written.push({ kind: 'asked', reason: input.reason });

        return Promise.resolve();
      },
      writeClosed: (input) => {
        written.push({ kind: 'closed', by: input.by, waitedSeconds: input.waitedSeconds });

        return Promise.resolve();
      },
    },
  });

  return { clock, written, held, handover };
}

test('it opens an ask and writes its reason', async () => {
  const ctx = setupTest();

  const result = await ctx.handover.ask('itch.io asks for a CAPTCHA');

  expect([result, ctx.written]).toStrictEqual([
    { kind: 'asked' },
    [{ kind: 'asked', reason: 'itch.io asks for a CAPTCHA' }],
  ]);
});

test('it refuses a second ask while one is open', async () => {
  const ctx = setupTest();

  await ctx.handover.ask('first');

  const result = await ctx.handover.ask('second');

  expect([result, ctx.written]).toStrictEqual([
    { kind: 'already_asked' },
    [{ kind: 'asked', reason: 'first' }],
  ]);
});

test('it refuses an ask while a hold is open', async () => {
  const ctx = setupTest();

  ctx.held.value = true;

  const result = await ctx.handover.ask('first');

  expect([result, ctx.written]).toStrictEqual([{ kind: 'taken_over' }, []]);
});

test('it refuses a cancel when no ask is open', async () => {
  const ctx = setupTest();

  const result = await ctx.handover.cancel();

  expect(result).toStrictEqual({ kind: 'not_asked' });
});

test('it closes an ask the assistant cancels and lets a new one open', async () => {
  const ctx = setupTest();

  await ctx.handover.ask('first');

  ctx.clock.advance(90_000);

  const cancelled = await ctx.handover.cancel();
  const again = await ctx.handover.ask('second');

  expect([cancelled, again, ctx.written]).toStrictEqual([
    { kind: 'cancelled' },
    { kind: 'asked' },
    [
      { kind: 'asked', reason: 'first' },
      { kind: 'closed', by: 'assistant', waitedSeconds: 90 },
      { kind: 'asked', reason: 'second' },
    ],
  ]);
});

test('it expires an ask that no take-over answers within its time', async () => {
  const ctx = setupTest();

  await ctx.handover.ask('first');

  ctx.clock.advance(60 * 60 * 1000);

  await waitForCondition(() => ctx.written.length === 2);

  expect(ctx.written).toStrictEqual([
    { kind: 'asked', reason: 'first' },
    { kind: 'closed', by: 'expired', waitedSeconds: 3600 },
  ]);
});

test('it writes no close for an ask that a take-over answered, and expires nothing later', async () => {
  const ctx = setupTest();

  await ctx.handover.ask('first');

  ctx.handover.answer();
  ctx.clock.advance(2 * 60 * 60 * 1000);

  const cancelled = await ctx.handover.cancel();

  expect([cancelled, ctx.written]).toStrictEqual([
    { kind: 'not_asked' },
    [{ kind: 'asked', reason: 'first' }],
  ]);
});

test('it expires an ask that a restart cut once the time since it was asked has passed', async () => {
  const ctx = setupTest();

  ctx.handover.resume(ctx.clock.now() - 61 * 60 * 1000);

  await waitForCondition(() => ctx.written.length === 1);

  expect(ctx.written).toStrictEqual([{ kind: 'closed', by: 'expired', waitedSeconds: 3660 }]);
});

test('it keeps a resumed ask open for the time it has left', async () => {
  const ctx = setupTest();

  ctx.handover.resume(ctx.clock.now() - 59 * 60 * 1000);

  const result = await ctx.handover.ask('again');

  ctx.clock.advance(60 * 1000);

  await waitForCondition(() => ctx.written.length === 1);

  expect([result, ctx.written]).toStrictEqual([
    { kind: 'already_asked' },
    [{ kind: 'closed', by: 'expired', waitedSeconds: 3600 }],
  ]);
});
