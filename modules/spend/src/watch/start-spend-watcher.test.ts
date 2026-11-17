import { expect, mock, onTestFinished, test } from 'bun:test';
import { readPause, withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { Logger } from '@heynixie/logger';
import { waitForCondition } from '@heynixie/testing';
import { spendLimitRaisedCodec } from '../record/spend-limit-raised-codec';
import type { SpendRaise } from '../stop/read-spend-raise';
import { readSpendStopRow } from '../stop/read-spend-stop-row';
import { buildMockGatewayStatus, buildTrippedGatewayStatus, startTestSpend } from '../test-utils';
import { runSpendPoll, startSpendWatcher } from './start-spend-watcher';

async function setupTest() {
  const spend = await startTestSpend();

  const stopping = new AbortController();

  const log = mock<Logger>(() => {});

  onTestFinished(() => {
    stopping.abort();
  });

  const limits = {
    day: { dollars: 60, tokens: 80_000_000 },
    month: { dollars: 600, tokens: 600_000_000 },
  };

  const options = {
    context: spend.context,
    limits,
    log,
    signal: stopping.signal,
    isStartUnreachable: false,
  };

  return {
    ...spend,
    log,
    options,
    limits,
    stopping,
    poll: (state: Parameters<typeof runSpendPoll>[1]) => runSpendPoll(options, state),
    readPaused: () => withWriteTransaction(spend.writer, (tx) => readPause(tx)),
    writeRaise: (raise: SpendRaise) =>
      withWriteTransaction(spend.writer, (tx) =>
        writeRecordsInTransaction(tx, spend.log, [
          {
            kind: spendLimitRaisedCodec.kind,
            definitions: spend.context.definitions(),
            payload: spendLimitRaisedCodec.encode({ start: '2026-10-16', ...raise }),
          },
        ]),
      ),
  };
}

test('it trips and pauses when the status shows a trip', async () => {
  const ctx = await setupTest();

  ctx.gateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildTrippedGatewayStatus() });

  await ctx.poll({ noAnswerSince: null, isLimitsPending: false });

  const spendStopRow = await readSpendStopRow(ctx.writer.db);

  expect(spendStopRow).toMatchObject({
    reason: 'limit',
    measure: 'dollars',
  });

  const paused = await ctx.readPaused();

  expect(paused).toStrictEqual({ cause: 'spending', recoveryID: null });
});

test('it trips for the lost mark', async () => {
  const ctx = await setupTest();

  ctx.gateway.readStatus.mockResolvedValue({
    kind: 'ok',
    value: buildMockGatewayStatus({ lost: true }),
  });

  await ctx.poll({ noAnswerSince: null, isLimitsPending: false });

  const spendStopRow = await readSpendStopRow(ctx.writer.db);

  expect(spendStopRow).toMatchObject({ reason: 'lost' });
});

test('it trips by turns and sends nothing to the gateway', async () => {
  const ctx = await setupTest();

  for (let turn = 0; turn < 1000; turn += 1) {
    await ctx.writeTurn();
  }

  await ctx.poll({ noAnswerSince: null, isLimitsPending: false });

  const spendStopRow = await readSpendStopRow(ctx.writer.db);

  expect(spendStopRow).toMatchObject({
    reason: 'limit',
    measure: 'turns',
  });

  expect(ctx.gateway.putLimits.mock.calls).toStrictEqual([]);
});

test('it trips after 30 seconds with no answer, and not before', async () => {
  const ctx = await setupTest();

  const state = { noAnswerSince: null, isLimitsPending: false };

  ctx.gateway.readStatus.mockResolvedValue({ kind: 'unreachable', reason: 'no answer' });

  await ctx.poll(state);

  ctx.clock.advance(29_000);

  await ctx.poll(state);

  const before = await readSpendStopRow(ctx.writer.db);

  ctx.clock.advance(1000);

  await ctx.poll(state);

  expect([before, await readSpendStopRow(ctx.writer.db)]).toMatchObject([
    null,
    { reason: 'unreachable' },
  ]);
});

test('it restarts the 30 seconds when the gateway answers in between', async () => {
  const ctx = await setupTest();

  const state = { noAnswerSince: null, isLimitsPending: false };

  ctx.gateway.readStatus.mockResolvedValueOnce({ kind: 'unreachable', reason: 'no answer' });

  await ctx.poll(state);

  ctx.clock.advance(20_000);

  await ctx.poll(state);

  ctx.clock.advance(20_000);
  ctx.gateway.readStatus.mockResolvedValueOnce({ kind: 'unreachable', reason: 'no answer' });

  await ctx.poll(state);

  const spendStopRow = await readSpendStopRow(ctx.writer.db);

  expect(spendStopRow).toBeNull();
});

test('it trips at the first poll of a start that found no answer, then sends the limits and clears when the gateway answers', async () => {
  const ctx = await setupTest();

  const state = { noAnswerSince: 0, isLimitsPending: true };

  ctx.gateway.readStatus.mockResolvedValue({ kind: 'unreachable', reason: 'no answer' });

  await ctx.poll(state);

  const tripped = await readSpendStopRow(ctx.writer.db);
  const pausedBy = await ctx.readPaused();

  ctx.gateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildMockGatewayStatus() });

  await ctx.poll(state);

  expect([tripped?.reason, pausedBy?.cause]).toStrictEqual(['unreachable', 'spending']);
  expect(ctx.gateway.putLimits.mock.calls).toStrictEqual([[ctx.limits]]);

  const spendStopRow = await readSpendStopRow(ctx.writer.db);

  expect(spendStopRow).toBeNull();

  const paused = await ctx.readPaused();

  expect(paused).toBeNull();
});

test('it sends the limits again when the gateway holds none', async () => {
  const ctx = await setupTest();

  const day = { ...buildMockGatewayStatus().periods.day, limit: null };

  ctx.gateway.readStatus.mockResolvedValue({
    kind: 'ok',
    value: buildMockGatewayStatus({
      periods: { day, month: buildMockGatewayStatus().periods.month },
    }),
  });

  await ctx.poll({ noAnswerSince: null, isLimitsPending: false });

  expect(ctx.gateway.putLimits.mock.calls).toStrictEqual([[ctx.limits]]);
});

test('it counts a failed limits send as no answer and trips after 30 seconds', async () => {
  const ctx = await setupTest();

  const state = { noAnswerSince: null, isLimitsPending: true };

  ctx.gateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildMockGatewayStatus() });
  ctx.gateway.putLimits.mockResolvedValue({ kind: 'unreachable', reason: 'no answer' });

  await ctx.poll(state);

  ctx.clock.advance(30_000);

  await ctx.poll(state);

  expect([state.isLimitsPending, await readSpendStopRow(ctx.writer.db)]).toMatchObject([
    true,
    { reason: 'unreachable' },
  ]);
});

test('it sends no limits to a gateway that holds them', async () => {
  const ctx = await setupTest();

  await ctx.poll({ noAnswerSince: null, isLimitsPending: false });

  expect(ctx.gateway.putLimits.mock.calls).toStrictEqual([]);
});

test('it treats a gateway in another zone as no answer and sends it nothing', async () => {
  const ctx = await setupTest();

  const state = { noAnswerSince: 0, isLimitsPending: true };

  ctx.gateway.readStatus.mockResolvedValue({
    kind: 'ok',
    value: buildMockGatewayStatus({ zone: 'Asia/Tokyo' }),
  });

  await ctx.poll(state);

  expect(ctx.gateway.putLimits.mock.calls).toStrictEqual([]);

  const spendStopRow = await readSpendStopRow(ctx.writer.db);

  expect(spendStopRow).toMatchObject({ reason: 'unreachable' });

  expect(ctx.log.mock.calls[0]).toStrictEqual([
    'spend.zone_mismatch',
    { gatewayZone: 'Asia/Tokyo', defaultZone: 'UTC' },
    'error',
  ]);
});

test('it sends a standing raise that the gateway has not applied, and clears the stop with its answer', async () => {
  const ctx = await setupTest();

  await ctx.writeRaise({ dollars: 90, tokens: 120_000_000, turns: 1500, by: 'host' });

  ctx.gateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildTrippedGatewayStatus() });
  ctx.gateway.postRaise.mockResolvedValue({ kind: 'ok', value: buildMockGatewayStatus() });

  await ctx.poll({ noAnswerSince: null, isLimitsPending: false });

  expect(ctx.gateway.postRaise.mock.calls).toStrictEqual([
    [{ start: '2026-10-16', limit: { dollars: 90, tokens: 120_000_000 } }],
  ]);

  const spendStopRow = await readSpendStopRow(ctx.writer.db);

  expect(spendStopRow).toBeNull();
});

test('it keeps the stop and sends the raise again at the next poll when the gateway does not answer the raise', async () => {
  const ctx = await setupTest();

  const state = { noAnswerSince: null, isLimitsPending: false };

  await ctx.writeRaise({ dollars: 90, tokens: 120_000_000, turns: 1500, by: 'host' });

  ctx.gateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildTrippedGatewayStatus() });
  ctx.gateway.postRaise.mockResolvedValue({ kind: 'unreachable', reason: 'no answer' });

  await ctx.poll(state);
  await ctx.poll(state);

  expect(ctx.gateway.postRaise.mock.calls).toHaveLength(2);

  const spendStopRow = await readSpendStopRow(ctx.writer.db);

  expect(spendStopRow).toMatchObject({ reason: 'limit' });
});

test('it sends no raise that the gateway holds already', async () => {
  const ctx = await setupTest();

  await ctx.writeRaise({ dollars: 60, tokens: 80_000_000, turns: 3000, by: 'host' });
  await ctx.poll({ noAnswerSince: null, isLimitsPending: false });

  expect(ctx.gateway.postRaise.mock.calls).toStrictEqual([]);
});

test('it polls every 10 seconds until it stops', async () => {
  const ctx = await setupTest();

  const watcher = startSpendWatcher(ctx.options);

  await waitForCondition(() => ctx.gateway.readStatus.mock.calls.length === 1);
  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  ctx.clock.advance(10_000);

  await waitForCondition(() => ctx.gateway.readStatus.mock.calls.length === 2);
  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  ctx.stopping.abort();

  await watcher.stop();

  expect(ctx.gateway.readStatus.mock.calls).toHaveLength(2);
});

test('it logs a failed poll and polls again', async () => {
  const ctx = await setupTest();

  ctx.gateway.readStatus.mockRejectedValueOnce(new Error('boom'));

  const watcher = startSpendWatcher(ctx.options);

  await waitForCondition(() => ctx.log.mock.calls.some((call) => call[0] === 'spend.watch_failed'));
  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  ctx.stopping.abort();

  await watcher.stop();
});
