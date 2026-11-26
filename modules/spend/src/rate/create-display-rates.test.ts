import { expect, mock, test } from 'bun:test';
import type { Logger } from '@heynixie/logger';
import { createFakeClock } from '@zgeoff/testing/clock';
import type { RateSource } from '../types';
import { createDisplayRates } from './create-display-rates';

function setupTest() {
  const clock = createFakeClock({ startMs: 0 });
  const readRate = mock<RateSource['readRate']>(() => Promise.resolve(1.52));
  const log = mock<Logger>(() => {});

  return {
    clock,
    readRate,
    log,
    rates: createDisplayRates({ currency: 'AUD', source: { readRate }, clock, log }),
  };
}

test('it waits for the first read and answers with its rate', async () => {
  const ctx = setupTest();

  const rate = await ctx.rates.readRate();

  expect(rate).toBe(1.52);
  expect(ctx.readRate).toHaveBeenCalledWith('AUD');
});

test('it reads the source once for the reads of one day', async () => {
  const ctx = setupTest();

  await ctx.rates.readRate();

  ctx.clock.advance(23 * 60 * 60 * 1000);

  await ctx.rates.readRate();

  expect(ctx.readRate).toHaveBeenCalledTimes(1);
});

test('it reads again a day later, and answers with the stale rate while it reads', async () => {
  const ctx = setupTest();

  await ctx.rates.readRate();

  ctx.readRate.mockResolvedValue(1.6);
  ctx.clock.advance(24 * 60 * 60 * 1000);

  const stale = await ctx.rates.readRate();
  const fresh = await ctx.rates.readRate();

  expect([stale, fresh, ctx.readRate.mock.calls.length]).toStrictEqual([1.52, 1.6, 2]);
});

test('it answers null while no read has given a rate', async () => {
  const ctx = setupTest();

  ctx.readRate.mockResolvedValue(null);

  const rate = await ctx.rates.readRate();

  expect(rate).toBeNull();
});

test('it keeps the last rate and logs when a later read throws', async () => {
  const ctx = setupTest();

  await ctx.rates.readRate();

  ctx.readRate.mockRejectedValue(new Error('no answer'));
  ctx.clock.advance(24 * 60 * 60 * 1000);

  await ctx.rates.readRate();

  const rate = await ctx.rates.readRate();

  expect(rate).toBe(1.52);
  expect(ctx.log).toHaveBeenCalledWith('spend.rate_read_failed', expect.anything(), 'warn');
});
