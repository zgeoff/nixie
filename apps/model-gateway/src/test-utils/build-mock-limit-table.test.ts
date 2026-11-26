import { expect, test } from 'bun:test';
import { buildMockLimitTable } from './build-mock-limit-table';

test('#buildMockLimitTable puts each route on the provider test', () => {
  const table = buildMockLimitTable({ alpha: null, beta: { day: 1, month: 2, dayCap: 3 } });

  expect(table).toStrictEqual({
    routes: { alpha: null, beta: { day: 1, month: 2, dayCap: 3 } },
    providers: { test: { day: 10_000, month: 100_000, dayCap: 20_000 } },
    providerOf: { alpha: 'test', beta: 'test' },
  });
});

test('#buildMockLimitTable takes the limits of the provider when given', () => {
  const table = buildMockLimitTable({ alpha: null }, { day: 5, month: 50, dayCap: 10 });

  expect(table.providers).toStrictEqual({ test: { day: 5, month: 50, dayCap: 10 } });
});
