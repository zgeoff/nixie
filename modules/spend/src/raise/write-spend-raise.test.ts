import { expect, test } from 'bun:test';
import { readPause, withWriteTransaction } from '@heynixie/log';
import { sql } from 'kysely';
import { readSpendFacts } from '../stop/read-spend-facts';
import { readSpendStopRow } from '../stop/read-spend-stop-row';
import { settleSpendStop } from '../stop/settle-spend-stop';
import { buildMockGatewayStatus, buildTrippedGatewayStatus, startTestSpend } from '../test-utils';
import type { RaiseRequest } from './pick-raise-refusal';
import { writeHostSpendRaise } from './write-host-spend-raise';
import { writeSpendRaise } from './write-spend-raise';

async function setupTest() {
  const spend = await startTestSpend();

  return {
    ...spend,
    trip: async () => {
      spend.gateway.readStatus.mockResolvedValue({
        kind: 'ok',
        value: buildTrippedGatewayStatus(),
      });

      const facts = await readSpendFacts(spend.context);

      await settleSpendStop(spend.context, facts);
    },
    raise: (overrides: Partial<RaiseRequest> = {}) =>
      writeSpendRaise(spend.context, {
        start: '2026-10-16',
        dollars: 90,
        tokens: 120_000_000,
        turns: 1500,
        by: 'session-a',
        ...overrides,
      }),
    hostRaise: (turns: number) => writeHostSpendRaise(spend.context, { turns }),
    readPaused: () => withWriteTransaction(spend.writer, (tx) => readPause(tx)),
    readRaises: async () => {
      const result =
        await sql`select start, dollars, tokens, turns, raised_by from spend_raises`.execute(
          spend.writer.db,
        );

      return result.rows;
    },
  };
}

test('it lifts a day trip with one call: it records the raise, tells the gateway and resumes nixie', async () => {
  const ctx = await setupTest();

  await ctx.trip();

  ctx.gateway.postRaise.mockResolvedValue({ kind: 'ok', value: buildMockGatewayStatus() });

  const result = await ctx.raise();
  const row = await readSpendStopRow(ctx.writer.db);
  const paused = await ctx.readPaused();
  const raises = await ctx.readRaises();

  expect(result).toStrictEqual({ state: 'clear' });

  expect(ctx.gateway.postRaise.mock.calls).toStrictEqual([
    [{ start: '2026-10-16', limit: { dollars: 90, tokens: 120_000_000 } }],
  ]);

  expect([row, paused]).toStrictEqual([null, null]);

  expect(raises).toStrictEqual([
    { start: '2026-10-16', dollars: 90, tokens: 120_000_000, turns: 1500, raised_by: 'session-a' },
  ]);
});

test('it leaves the stop standing when the raise lifts only some of what tripped', async () => {
  const ctx = await setupTest();

  await ctx.trip();

  ctx.gateway.postRaise.mockResolvedValue({ kind: 'ok', value: buildTrippedGatewayStatus() });

  const result = await ctx.raise();
  const row = await readSpendStopRow(ctx.writer.db);

  expect([result, row?.reason]).toStrictEqual([{ state: 'stopped' }, 'limit']);
});

test('it refuses a raise above a cap, writes nothing and tells the gateway nothing', async () => {
  const ctx = await setupTest();

  await ctx.trip();

  const result = await ctx.raise({ dollars: 121 });
  const raises = await ctx.readRaises();

  expect(result).toStrictEqual({
    error: 'above_cap',
    cap: { dollars: 120, tokens: 160_000_000, turns: 2000 },
  });

  expect([raises, ctx.gateway.postRaise.mock.calls]).toStrictEqual([[], []]);
});

test('it refuses a turn raise above the turn cap', async () => {
  const ctx = await setupTest();

  await ctx.trip();

  const result = await ctx.raise({ turns: 2001 });

  expect(result).toMatchObject({ error: 'above_cap', cap: { turns: 2000 } });
});

test('it refuses a raise for a day that has ended', async () => {
  const ctx = await setupTest();

  await ctx.trip();

  const result = await ctx.raise({ start: '2026-10-15' });
  const raises = await ctx.readRaises();

  expect([result, raises]).toStrictEqual([{ error: 'period_ended' }, []]);
});

test('it writes nothing and returns the error when the gateway refuses the raise above its cap', async () => {
  const ctx = await setupTest();

  await ctx.trip();

  ctx.gateway.postRaise.mockResolvedValue({
    kind: 'above_cap',
    period: 'day',
    cap: { dollars: 80, tokens: 100_000_000 },
  });

  const result = await ctx.raise();
  const raises = await ctx.readRaises();

  expect(result).toStrictEqual({
    error: 'above_cap',
    cap: { dollars: 80, tokens: 100_000_000, turns: 2000 },
  });

  expect(raises).toStrictEqual([]);
});

test('it keeps the record when the gateway does not answer the raise, for the watcher to send again', async () => {
  const ctx = await setupTest();

  await ctx.trip();

  ctx.gateway.postRaise.mockResolvedValue({ kind: 'unreachable', reason: 'no answer' });

  const result = await ctx.raise();
  const raises = await ctx.readRaises();
  const row = await readSpendStopRow(ctx.writer.db);

  expect([result, raises.length, row?.reason]).toStrictEqual([
    { error: 'unreachable' },
    1,
    'limit',
  ]);
});

test('it answers unreachable and writes nothing when the gateway does not answer the status', async () => {
  const ctx = await setupTest();

  ctx.gateway.readStatus.mockResolvedValue({ kind: 'unreachable', reason: 'no answer' });

  const result = await ctx.raise();
  const raises = await ctx.readRaises();

  expect([result, raises]).toStrictEqual([{ error: 'unreachable' }, []]);
});

test('it keeps the turns that an earlier raise set above what this raise holds', async () => {
  const ctx = await setupTest();

  await ctx.trip();

  ctx.gateway.postRaise.mockResolvedValue({ kind: 'ok', value: buildMockGatewayStatus() });

  await ctx.hostRaise(3000);
  await ctx.raise({ turns: 1500 });

  const raises = await ctx.readRaises();

  expect(raises).toMatchObject([{ turns: 3000 }]);
});

test('it keeps the larger totals when two raises land at once', async () => {
  const ctx = await setupTest();

  await ctx.trip();

  ctx.gateway.postRaise.mockResolvedValue({ kind: 'ok', value: buildMockGatewayStatus() });

  await Promise.all([
    ctx.raise({ dollars: 110, tokens: 110_000_000, turns: 1900 }),
    ctx.raise({ dollars: 90, tokens: 100_000_000, turns: 1200 }),
  ]);

  const raises = await ctx.readRaises();

  expect(raises).toStrictEqual([
    {
      start: '2026-10-16',
      dollars: 110,
      tokens: 110_000_000,
      turns: 1900,
      raised_by: 'session-a',
    },
  ]);
});
