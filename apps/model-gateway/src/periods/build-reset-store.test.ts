import { expect, test } from 'bun:test';
import type { PeriodStore } from '../types';
import { buildResetStore } from './build-reset-store';

function setupTest() {
  const store: PeriodStore = {
    version: 2,
    lost: false,
    periods: {
      day: {
        start: '2026-11-24',
        resetsAt: '2026-11-25T00:00:00.000Z',
        dollars: 4,
        tokens: 40,
        limit: { dollars: 10, tokens: 100 },
        raise: { dollars: 20, tokens: 200 },
        trippedAt: null,
      },
      month: {
        start: '2026-11-01',
        resetsAt: '2026-12-01T00:00:00.000Z',
        dollars: 4,
        tokens: 40,
        limit: { dollars: 100, tokens: 1000 },
        raise: null,
        trippedAt: null,
      },
    },
    sandboxes: {},
  };

  return { store };
}

test('#buildResetStore keeps the count of a period that began in another zone until its end', () => {
  const ctx = setupTest();
  const reset = buildResetStore(ctx.store, Date.parse('2026-11-24T12:00:00Z'), 'Pacific/Auckland');

  expect(reset).toBe(ctx.store);
});

test('#buildResetStore resets a period at its end and starts the next one in the new zone', () => {
  const ctx = setupTest();
  const reset = buildResetStore(ctx.store, Date.parse('2026-11-25T00:00:00Z'), 'Pacific/Auckland');

  expect(reset.periods).toStrictEqual({
    day: {
      start: '2026-11-25',
      resetsAt: '2026-11-25T11:00:00.000Z',
      dollars: 0,
      tokens: 0,
      limit: { dollars: 10, tokens: 100 },
      raise: null,
      trippedAt: null,
    },
    month: ctx.store.periods.month,
  });
});

test('#buildResetStore keeps a period that stamps no end until its UTC end, whatever the zone', () => {
  const ctx = setupTest();

  const legacy: PeriodStore = {
    ...ctx.store,
    periods: {
      day: { ...ctx.store.periods.day, resetsAt: null },
      month: { ...ctx.store.periods.month, resetsAt: null },
    },
  };

  const reset = buildResetStore(legacy, Date.parse('2026-11-24T12:00:00Z'), 'Pacific/Auckland');

  expect(reset).toBe(legacy);
});

test('#buildResetStore resets a period that stamps no end at the next UTC start', () => {
  const ctx = setupTest();

  const reset = buildResetStore(
    {
      ...ctx.store,
      periods: {
        day: { ...ctx.store.periods.day, resetsAt: null },
        month: { ...ctx.store.periods.month, resetsAt: null },
      },
    },
    Date.parse('2026-11-25T00:00:00Z'),
    'Pacific/Auckland',
  );

  expect([reset.periods.day.start, reset.periods.month.start]).toStrictEqual([
    '2026-11-25',
    '2026-11-01',
  ]);
});
