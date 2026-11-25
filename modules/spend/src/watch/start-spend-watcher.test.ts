import { expect, mock, onTestFinished, test } from 'bun:test';
import {
  readPause,
  readRecords,
  spendWaitNoticeCodec,
  subscribeToChanged,
  withWriteTransaction,
  writeRecordsInTransaction,
} from '@heynixie/log';
import type { Logger } from '@heynixie/logger';
import { waitForCondition } from '@heynixie/testing';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import { writeSpendRaise } from '../raise/write-spend-raise';
import { spendLimitRaisedCodec } from '../record/spend-limit-raised-codec';
import { holdTaskOnRefusal } from '../route/hold-task-on-refusal';
import { holdTaskOnRoute } from '../route/hold-task-on-route';
import type { SpendRaise } from '../stop/read-spend-raise';
import { readSpendRouteStops } from '../stop/read-spend-route-stops';
import { readSpendStopRow } from '../stop/read-spend-stop-row';
import { buildMockGatewayStatus, buildTrippedGatewayStatus, startTestSpend } from '../test-utils';
import { runSpendPoll, startSpendWatcher } from './start-spend-watcher';

async function setupTest() {
  const spend = await startTestSpend({ dayTurns: 3, dayTurnCap: 10, monthTurns: 100 });

  // the mock gateway counts the day of 13 Nov 2026
  spend.clock.advance(28 * 86_400_000);

  const stopping = new AbortController();

  const log = mock<Logger>(() => {});

  onTestFinished(() => {
    stopping.abort();
  });

  const options = {
    context: spend.context,
    log,
    signal: stopping.signal,
    isStartUnreachable: false,
  };

  return {
    ...spend,
    log,
    options,
    stopping,
    poll: (state: Parameters<typeof runSpendPoll>[1]) => runSpendPoll(options, state),
    readPaused: () => withWriteTransaction(spend.writer, (tx) => readPause(tx)),
    writeRaise: (raise: Pick<SpendRaise, 'by'> & { readonly dollars: number }) =>
      withWriteTransaction(spend.writer, (tx) =>
        writeRecordsInTransaction(tx, spend.log, [
          {
            kind: spendLimitRaisedCodec.kind,
            definitions: spend.context.definitions(),
            payload: spendLimitRaisedCodec.encode({
              start: '2026-11-13',
              route: 'plan',
              ...raise,
            }),
          },
        ]),
      ),
  };
}

test('it stops the route that reached its limit, sends the owner one notice and pauses nothing', async () => {
  const ctx = await setupTest();

  ctx.gateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildTrippedGatewayStatus() });

  const state = { noAnswerSince: null, lastStopKey: null };

  await ctx.poll(state);
  await ctx.poll(state);

  const routeStops = await readSpendRouteStops(ctx.writer.db);
  const spendStopRow = await readSpendStopRow(ctx.writer.db);
  const paused = await ctx.readPaused();

  const notices = await sql`select payload from records where kind = 'spend.route_stopped'`.execute(
    ctx.writer.db,
  );

  expect(notices.rows).toHaveLength(1);
  expect(routeStops).toMatchObject([{ route: 'plan', period: 'day', limit: 40 }]);
  expect([spendStopRow, paused]).toStrictEqual([null, null]);
});

test('it trips for the lost mark', async () => {
  const ctx = await setupTest();

  ctx.gateway.readStatus.mockResolvedValue({
    kind: 'ok',
    value: buildMockGatewayStatus({ lost: true }),
  });

  await ctx.poll({ noAnswerSince: null, lastStopKey: null });

  const spendStopRow = await readSpendStopRow(ctx.writer.db);

  expect(spendStopRow).toMatchObject({ reason: 'lost' });
});

test('it trips by turns and sends nothing to the gateway', async () => {
  const ctx = await setupTest();

  for (let turn = 0; turn < 3; turn += 1) {
    await ctx.writeTurn();
  }

  await ctx.poll({ noAnswerSince: null, lastStopKey: null });

  const spendStopRow = await readSpendStopRow(ctx.writer.db);

  expect(spendStopRow).toMatchObject({ reason: 'limit', measure: 'turns' });
  expect(ctx.gateway.postRaise.mock.calls).toStrictEqual([]);
});

test('it trips after 30 seconds with no answer, and not before', async () => {
  const ctx = await setupTest();

  const state = { noAnswerSince: null, lastStopKey: null };

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

  const state = { noAnswerSince: null, lastStopKey: null };

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

test('it trips at the first poll of a start that found no answer, then clears when the gateway answers', async () => {
  const ctx = await setupTest();

  const state = { noAnswerSince: 0, lastStopKey: null };

  ctx.gateway.readStatus.mockResolvedValue({ kind: 'unreachable', reason: 'no answer' });

  await ctx.poll(state);

  const tripped = await readSpendStopRow(ctx.writer.db);
  const pausedBy = await ctx.readPaused();

  ctx.gateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildMockGatewayStatus() });

  await ctx.poll(state);

  expect([tripped?.reason, pausedBy?.cause]).toStrictEqual(['unreachable', 'spending']);

  const spendStopRow = await readSpendStopRow(ctx.writer.db);

  expect(spendStopRow).toBeNull();

  const paused = await ctx.readPaused();

  expect(paused).toBeNull();
});

test('it treats a gateway in another zone as no answer and sends it nothing', async () => {
  const ctx = await setupTest();

  const state = { noAnswerSince: 0, lastStopKey: null };

  ctx.gateway.readStatus.mockResolvedValue({
    kind: 'ok',
    value: buildMockGatewayStatus({ zone: 'Asia/Tokyo' }),
  });

  await ctx.poll(state);

  const spendStopRow = await readSpendStopRow(ctx.writer.db);

  expect(spendStopRow).toMatchObject({ reason: 'unreachable' });

  expect(ctx.log.mock.calls[0]).toStrictEqual([
    'spend.zone_mismatch',
    { gatewayZone: 'Asia/Tokyo', defaultZone: 'UTC' },
    'error',
  ]);
});

test('it sends a standing raise that the gateway has not applied, and clears the route stop with its answer', async () => {
  const ctx = await setupTest();

  await ctx.writeRaise({ dollars: 60, by: 'session-a' });

  ctx.gateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildTrippedGatewayStatus() });
  ctx.gateway.postRaise.mockResolvedValue({ kind: 'ok', value: buildMockGatewayStatus() });

  await ctx.poll({ noAnswerSince: null, lastStopKey: null });

  expect(ctx.gateway.postRaise.mock.calls).toStrictEqual([
    [{ route: 'plan', start: '2026-11-13', dollars: 60 }],
  ]);

  const routeStops = await readSpendRouteStops(ctx.writer.db);

  expect(routeStops).toStrictEqual([]);
});

test('it keeps the route stop cleared when a task read the route before the raise took effect and its answer comes after', async () => {
  const ctx = await setupTest();

  const state = { noAnswerSince: null, lastStopKey: null };
  const staleStatus = Promise.withResolvers<Awaited<ReturnType<typeof ctx.gateway.readStatus>>>();
  let staleRead: Promise<boolean> = Promise.resolve(false);

  ctx.gateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildTrippedGatewayStatus() });

  await ctx.poll(state);
  await ctx.writeRaise({ dollars: 60, by: 'session-a' });

  ctx.gateway.readStatus
    .mockResolvedValueOnce({ kind: 'ok', value: buildTrippedGatewayStatus() })
    .mockReturnValueOnce(staleStatus.promise);

  ctx.gateway.postRaise.mockImplementationOnce(() => {
    staleRead = holdTaskOnRefusal(ctx.context, {
      taskID: 'task-a',
      route: 'plan',
      sandboxName: 'sandbox-a',
      startedAtMs: 0,
    });

    return Promise.resolve({ kind: 'ok', value: buildMockGatewayStatus() });
  });

  await ctx.poll(state);

  staleStatus.resolve({ kind: 'ok', value: buildTrippedGatewayStatus() });

  await staleRead;

  const routeStops = await readSpendRouteStops(ctx.writer.db);

  expect(routeStops).toStrictEqual([]);
});

test('it keeps the route stop cleared when your raise clears it while the gateway has yet to answer the resend of the watcher', async () => {
  const ctx = await setupTest();

  const state = { noAnswerSince: null, lastStopKey: null };
  const resendAnswer = Promise.withResolvers<Awaited<ReturnType<typeof ctx.gateway.postRaise>>>();
  let yourRaise: Promise<unknown> = Promise.resolve();

  ctx.gateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildTrippedGatewayStatus() });

  await ctx.poll(state);
  await ctx.writeRaise({ dollars: 41, by: 'session-a' });

  ctx.gateway.postRaise
    .mockImplementationOnce(() => {
      yourRaise = writeSpendRaise(ctx.context, {
        start: '2026-11-13',
        route: 'plan',
        dollars: 60,
        by: 'session-b',
      });

      return resendAnswer.promise;
    })
    .mockResolvedValueOnce({ kind: 'ok', value: buildMockGatewayStatus() });

  const polling = ctx.poll(state);

  await waitForCondition(() => ctx.gateway.postRaise.mock.calls.length >= 2);
  await yourRaise;

  resendAnswer.resolve({ kind: 'ok', value: buildTrippedGatewayStatus() });

  await polling;

  const routeStops = await readSpendRouteStops(ctx.writer.db);

  expect(routeStops).toStrictEqual([]);
});

test('it dates a route trip that the answer to a resend shows from the instant before the resend went out', async () => {
  const ctx = await setupTest();

  const state = { noAnswerSince: null, lastStopKey: null };
  const status = buildMockGatewayStatus();
  const plan = status.routes['plan'];

  invariant(plan !== undefined, 'the mock status holds the route plan');

  const raisedAndSpent = buildMockGatewayStatus({
    routes: {
      ...status.routes,
      plan: { ...plan, day: { ...plan.day, limit: 60, dollars: 61.5, tripped: true } },
    },
  });

  const postedAtMs = ctx.clock.now() + 1000;

  await ctx.writeRaise({ dollars: 60, by: 'session-a' });

  ctx.gateway.readStatus.mockImplementationOnce(() => {
    ctx.clock.advance(1000);

    return Promise.resolve({ kind: 'ok', value: status });
  });

  ctx.gateway.postRaise.mockResolvedValueOnce({ kind: 'ok', value: raisedAndSpent });

  await ctx.poll(state);

  const routeStops = await readSpendRouteStops(ctx.writer.db);

  expect(routeStops.map((stop) => stop.at)).toStrictEqual([postedAtMs]);
});

test('it ends a wait notice no earlier than the hold began, when a task is held while the resend is in flight', async () => {
  const ctx = await setupTest();

  const state = { noAnswerSince: null, lastStopKey: null };

  ctx.gateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildTrippedGatewayStatus() });

  await ctx.poll(state);
  await ctx.writeRaise({ dollars: 60, by: 'session-a' });

  const heldAtMs = ctx.clock.now() + 60_000;

  ctx.gateway.postRaise.mockImplementationOnce(async () => {
    ctx.clock.advance(60_000);

    await holdTaskOnRoute(ctx.context, 'task-a', 'plan');

    return { kind: 'ok', value: buildMockGatewayStatus() };
  });

  await ctx.poll(state);

  const notices = await readRecords(ctx.context.log, {
    afterSequence: 0,
    thread: 'task-a',
    kinds: ['spend.wait_notice'],
  });

  expect(notices.map((entry) => spendWaitNoticeCodec.decode(entry.record.payload))).toStrictEqual([
    { taskID: 'task-a', sinceMs: heldAtMs, untilMs: heldAtMs },
  ]);
});

test('it keeps the route stop and sends the raise again at the next poll when the gateway does not answer the raise', async () => {
  const ctx = await setupTest();

  const state = { noAnswerSince: null, lastStopKey: null };

  await ctx.writeRaise({ dollars: 60, by: 'session-a' });

  ctx.gateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildTrippedGatewayStatus() });
  ctx.gateway.postRaise.mockResolvedValue({ kind: 'unreachable', reason: 'no answer' });

  await ctx.poll(state);
  await ctx.poll(state);

  const routeStops = await readSpendRouteStops(ctx.writer.db);

  expect(ctx.gateway.postRaise.mock.calls).toHaveLength(2);
  expect(routeStops).toMatchObject([{ route: 'plan' }]);
});

test('it sends no raise that the gateway holds already', async () => {
  const ctx = await setupTest();

  await ctx.writeRaise({ dollars: 40, by: 'session-a' });
  await ctx.poll({ noAnswerSince: null, lastStopKey: null });

  expect(ctx.gateway.postRaise.mock.calls).toStrictEqual([]);
});

test('it polls every 10 seconds until it stops', async () => {
  const ctx = await setupTest();

  const watcher = startSpendWatcher(ctx.options);

  await waitForCondition(() => ctx.gateway.readStatus.mock.calls.length === 1);
  await waitForCondition(() => ctx.clock.countPending() === 1);

  ctx.clock.advance(10_000);

  await waitForCondition(() => ctx.gateway.readStatus.mock.calls.length === 2);
  await waitForCondition(() => ctx.clock.countPending() === 1);

  ctx.stopping.abort();

  await watcher.stop();

  expect(ctx.gateway.readStatus.mock.calls).toHaveLength(2);
});

test('it logs a failed poll and polls again', async () => {
  const ctx = await setupTest();

  ctx.gateway.readStatus.mockRejectedValueOnce(new Error('boom'));

  const watcher = startSpendWatcher(ctx.options);

  await waitForCondition(() => ctx.log.mock.calls.some((call) => call[0] === 'spend.watch_failed'));
  await waitForCondition(() => ctx.clock.countPending() === 1);

  ctx.stopping.abort();

  await watcher.stop();
});

test('it holds the plan logins at each poll, and marks them unreachable when the gateway gives none', async () => {
  const ctx = await setupTest();

  ctx.gateway.readChatGPTLogins.mockResolvedValue({
    kind: 'ok',
    value: { 'codex-plan': { status: 'active', accountID: 'acct-test-1', planType: 'plus' } },
  });

  await ctx.poll({ noAnswerSince: null, lastStopKey: null });

  const first = ctx.context.planLogins.read();

  ctx.gateway.readChatGPTLogins.mockResolvedValue({ kind: 'unreachable', reason: 'down' });

  await ctx.poll({ noAnswerSince: null, lastStopKey: null });

  expect([first, ctx.context.planLogins.read()]).toStrictEqual([
    {
      state: 'read',
      routes: { 'codex-plan': { status: 'active', accountID: 'acct-test-1', planType: 'plus' } },
    },
    { state: 'unreachable' },
  ]);
});

test('it names the spend topic when the stop differs from its last read', async () => {
  const ctx = await setupTest();

  const changes: (readonly string[])[] = [];

  subscribeToChanged(ctx.writer, (topics) => {
    changes.push(topics);
  });

  const state = { noAnswerSince: null, lastStopKey: null };

  ctx.gateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildMockGatewayStatus() });

  await ctx.poll(state);

  ctx.gateway.readStatus.mockResolvedValue({ kind: 'unreachable', reason: 'no answer' });

  await ctx.poll(state);

  expect(changes.filter((topics) => topics.length === 1 && topics[0] === 'spend')).toHaveLength(1);
});

test('it names no topic when the stop is what its last read found', async () => {
  const ctx = await setupTest();

  const changes: (readonly string[])[] = [];

  subscribeToChanged(ctx.writer, (topics) => {
    changes.push(topics);
  });

  const state = { noAnswerSince: null, lastStopKey: null };

  ctx.gateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildMockGatewayStatus() });

  await ctx.poll(state);
  await ctx.poll(state);

  expect(changes).toStrictEqual([]);
});
