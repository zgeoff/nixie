import { expect, test } from 'bun:test';
import type { PeriodStore } from '../types';
import { buildResetStore } from './build-reset-store';

function setupTest() {
  const resetsDay = '2026-11-25T00:00:00.000Z';
  const resetsMonth = '2026-12-01T00:00:00.000Z';

  const plan = {
    day: {
      start: '2026-11-24',
      resetsAt: resetsDay,
      micros: 4_000_000,
      raise: 20,
      trippedAt: '2026-11-24T10:00:00.000Z',
    },
    month: {
      start: '2026-11-01',
      resetsAt: resetsMonth,
      micros: 4_000_000,
      raise: null,
      trippedAt: null,
    },
  };

  const metered = {
    day: {
      start: '2026-11-24',
      resetsAt: resetsDay,
      micros: 1_000_000,
      raise: null,
      trippedAt: null,
    },
    month: {
      start: '2026-11-01',
      resetsAt: resetsMonth,
      micros: 1_000_000,
      raise: null,
      trippedAt: null,
    },
  };

  const store: PeriodStore = {
    version: 3,
    lost: false,
    routes: { plan, metered },
    sandboxes: {},
  };

  return { store, plan, metered };
}

test('#buildResetStore keeps the count of a period that began in another zone until its end', () => {
  const ctx = setupTest();
  const reset = buildResetStore(ctx.store, Date.parse('2026-11-24T12:00:00Z'), 'Pacific/Auckland');

  expect(reset).toBe(ctx.store);
});

test('#buildResetStore resets the day of every route at its end, in the new zone, and keeps the month', () => {
  const ctx = setupTest();
  const reset = buildResetStore(ctx.store, Date.parse('2026-11-25T00:00:00Z'), 'Pacific/Auckland');

  const fresh = {
    start: '2026-11-25',
    resetsAt: '2026-11-25T11:00:00.000Z',
    micros: 0,
    raise: null,
    trippedAt: null,
  };

  expect(reset.routes).toStrictEqual({
    plan: { day: fresh, month: ctx.plan.month },
    metered: { day: fresh, month: ctx.metered.month },
  });
});
