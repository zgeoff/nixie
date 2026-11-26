import { expect, test } from 'bun:test';
import { buildVersion3Store } from './build-version-3-store';

function setupTest() {
  return {
    emptyDay: {
      start: '2026-11-13',
      resetsAt: '2026-11-14T00:00:00.000Z',
      micros: 0,
      raise: null,
      trippedAt: null,
    },
    emptyMonth: {
      start: '2026-11-01',
      resetsAt: '2026-12-01T00:00:00.000Z',
      micros: 0,
      raise: null,
      trippedAt: null,
    },
    nowMs: Date.parse('2026-11-13T10:00:00Z'),
  };
}

test('#buildVersion3Store gives every route the whole count of a version 2 store and names no provider', () => {
  const ctx = setupTest();

  const store = buildVersion3Store(
    {
      kind: 'periods',
      lost: true,
      day: { start: '2026-11-13', dollars: 7, raise: { dollars: 9 }, trippedAt: null },
      month: { start: '2026-11-01', dollars: 9 },
      sandboxes: { alpha: { dollars: 1, tokens: 2, limit: null } },
    },
    ctx.nowMs,
    'Europe/London',
    ['plan', 'metered'],
  );

  const counted = {
    day: { ...ctx.emptyDay, micros: 7_000_000, raise: 9 },
    month: { ...ctx.emptyMonth, micros: 9_000_000 },
  };

  expect(store).toStrictEqual({
    version: 3,
    lost: true,
    routes: { plan: counted, metered: counted },
    sandboxes: {
      alpha: { micros: 1_000_000, tokens: 2, limit: null, lastRefusal: null, limitRevision: 0 },
    },
  });
});

test('#buildVersion3Store starts every route at zero for a count of one total', () => {
  const ctx = setupTest();

  const store = buildVersion3Store({ kind: 'total', lost: false }, ctx.nowMs, 'Europe/London', [
    'plan',
  ]);

  expect(store).toStrictEqual({
    version: 3,
    routes: { plan: { day: ctx.emptyDay, month: ctx.emptyMonth } },
    sandboxes: {},
  });
});

test('#buildVersion3Store drops the count of a period that has ended', () => {
  const ctx = setupTest();

  const store = buildVersion3Store(
    {
      kind: 'periods',
      lost: false,
      day: { start: '2026-11-12', dollars: 7 },
      month: { start: '2026-11-01', dollars: 9 },
      sandboxes: {},
    },
    ctx.nowMs,
    'Europe/London',
    ['plan'],
  );

  expect(store.routes['plan']).toStrictEqual({
    day: ctx.emptyDay,
    month: { ...ctx.emptyMonth, micros: 9_000_000 },
  });
});
