import { expect, mock, test } from 'bun:test';
import type { Logger } from '@heynixie/logger';
import { makeLostLatch } from './make-lost-latch';

function setupTest() {
  const writes: PromiseWithResolvers<undefined>[] = [];

  const markLost = () => {
    const write = Promise.withResolvers<undefined>();

    writes.push(write);

    return write.promise;
  };

  const log = mock<Logger>(() => {});

  return { writes, log, latch: makeLostLatch(markLost, log) };
}

test('it holds while the mark is written', () => {
  const ctx = setupTest();

  void ctx.latch.loseCount();
  expect(ctx.latch.isHeld()).toBeTrue();
});

test('it lets go once the mark is in the store', async () => {
  const ctx = setupTest();
  const lost = ctx.latch.loseCount();

  ctx.writes[0]?.resolve(undefined);

  await lost;

  expect(ctx.latch.isHeld()).toBeFalse();
});

test('it holds for good once a mark cannot be written, and logs it', async () => {
  const ctx = setupTest();
  const lost = ctx.latch.loseCount();

  ctx.writes[0]?.reject(new Error('disk full'));

  await lost;

  expect(ctx.latch.isHeld()).toBeTrue();

  expect(ctx.log).toHaveBeenCalledWith(
    'counter.mark_failed',
    expect.objectContaining({ message: 'disk full' }),
    'error',
  );
});

test('it holds while a second mark is written after the first one landed', async () => {
  const ctx = setupTest();
  const first = ctx.latch.loseCount();
  const second = ctx.latch.loseCount();

  ctx.writes[0]?.resolve(undefined);

  await first;

  const isHeldDuring = ctx.latch.isHeld();

  ctx.writes[1]?.resolve(undefined);

  await second;

  expect(isHeldDuring).toBeTrue();
});

test('it holds once the second of two overlapping marks fails after the first one landed', async () => {
  const ctx = setupTest();
  const first = ctx.latch.loseCount();
  const second = ctx.latch.loseCount();

  ctx.writes[0]?.resolve(undefined);

  await first;

  ctx.writes[1]?.reject(new Error('disk full'));

  await second;

  expect(ctx.latch.isHeld()).toBeTrue();
});
