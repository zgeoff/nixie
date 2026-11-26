import { expect, test } from 'bun:test';
import { buildMockGatewayStatus } from '../test-utils/build-stub-spend-gateway';
import { startTestSpend } from '../test-utils/start-test-spend';
import { readSpendCounts } from './read-spend-counts';

test('it gives each provider and each route its day and month count and limit in US dollars', async () => {
  const ctx = await startTestSpend();

  ctx.gateway.readStatus.mockResolvedValue({
    kind: 'ok',
    value: buildMockGatewayStatus(),
  });

  const counts = await readSpendCounts(ctx.context);

  expect(counts).toStrictEqual({
    providers: [
      {
        provider: 'main',
        day: { start: '2026-11-13', dollars: 0, limit: 100, tripped: false },
        month: { start: '2026-11-01', dollars: 0, limit: 1000, tripped: false },
      },
    ],
    routes: [
      {
        route: 'plan',
        provider: 'main',
        day: { start: '2026-11-13', dollars: 0, limit: 40, tripped: false },
        month: { start: '2026-11-01', dollars: 0, limit: 600, tripped: false },
      },
      {
        route: 'metered',
        provider: 'main',
        day: { start: '2026-11-13', dollars: 0, limit: 5, tripped: false },
        month: { start: '2026-11-01', dollars: 0, limit: 600, tripped: false },
      },
    ],
    display: null,
  });
});

test('it gives no route when the gateway does not answer', async () => {
  const ctx = await startTestSpend();

  ctx.gateway.readStatus.mockResolvedValue({ kind: 'unreachable', reason: 'no answer' });

  const counts = await readSpendCounts(ctx.context);

  expect([counts.routes, counts.providers]).toStrictEqual([[], []]);
});

test('it names the display currency with its rate', async () => {
  const ctx = await startTestSpend();

  const counts = await readSpendCounts({
    ...ctx.context,
    display: { currency: 'AUD', readRate: () => Promise.resolve(1.52) },
  });

  expect(counts.display).toStrictEqual({ currency: 'AUD', rate: 1.52 });
});

test('it names no display before a read has given a rate', async () => {
  const ctx = await startTestSpend();

  const counts = await readSpendCounts({
    ...ctx.context,
    display: { currency: 'AUD', readRate: () => Promise.resolve(null) },
  });

  expect(counts.display).toBeNull();
});
