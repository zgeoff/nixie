import { expect, test } from 'bun:test';
import { readPause, withWriteTransaction } from '@heynixie/log';
import { writeSpendRaiseRecord } from '../raise/write-spend-raise-record';
import { readSpendStopRow } from '../stop/read-spend-stop-row';
import { writeSpendTrip } from '../stop/write-spend-trip';
import { startTestSpend } from '../test-utils';
import { checkSpendTurns } from './check-spend-turns';

async function setupTest() {
  const spend = await startTestSpend({ dayTurns: 3, dayTurnCap: 5, monthTurns: 4 });

  return {
    ...spend,
    check: () => checkSpendTurns(spend.context),
    readPaused: () => withWriteTransaction(spend.writer, (tx) => readPause(tx)),
  };
}

test('it opens the step under both limits and reads no gateway', async () => {
  const ctx = await setupTest();

  await ctx.writeTurn();
  await ctx.writeTurn();

  const result = await ctx.check();

  expect([result, ctx.gateway.readStatus.mock.calls]).toStrictEqual(['open', []]);
});

test('it trips the stop and pauses at the day limit', async () => {
  const ctx = await setupTest();

  await ctx.writeTurn();
  await ctx.writeTurn();
  await ctx.writeTurn('worker.turn_ended');

  const result = await ctx.check();
  const row = await readSpendStopRow(ctx.writer.db);
  const paused = await ctx.readPaused();

  expect([result, paused?.cause]).toStrictEqual(['stopped', 'spending']);

  expect(row).toStrictEqual({
    reason: 'limit',
    period: 'day',
    measure: 'turns',
    limit: 3,
    spent: 3,
    at: ctx.clock.now(),
    resetsAt: Date.parse('2026-10-17T00:00:00Z'),
  });
});

test('it trips the stop at the month limit when the day is under its own', async () => {
  const ctx = await setupTest();

  // two days of 2 turns each: the day has 2, the month has 4
  for (let turn = 0; turn < 2; turn += 1) {
    await ctx.writeTurn();
  }

  ctx.clock.advance(15 * 60 * 60 * 1000);

  for (let turn = 0; turn < 2; turn += 1) {
    await ctx.writeTurn();
  }

  const result = await ctx.check();
  const row = await readSpendStopRow(ctx.writer.db);

  expect([result, row?.period, row?.limit]).toStrictEqual(['stopped', 'month', 4]);
});

test("it trips no stop of yesterday when midnight passes before the trip's write", async () => {
  const ctx = await setupTest();

  await ctx.writeTurn();
  await ctx.writeTurn();
  await ctx.writeTurn();

  const checking = ctx.check();

  ctx.clock.advance(15 * 60 * 60 * 1000);

  const result = await checking;
  const row = await readSpendStopRow(ctx.writer.db);

  expect([result, row]).toStrictEqual(['open', null]);
});

test("it trips no stop when a raise of turns lands before the trip's write", async () => {
  const ctx = await setupTest();

  await ctx.writeTurn();
  await ctx.writeTurn();
  await ctx.writeTurn();

  const checking = ctx.check();

  await writeSpendRaiseRecord(ctx.context, { start: '2026-10-16', turns: 5, by: 'host' });

  const result = await checking;
  const row = await readSpendStopRow(ctx.writer.db);

  expect([result, row]).toStrictEqual(['open', null]);
});

test('it ends the step with no second trip when the stop already stands', async () => {
  const ctx = await setupTest();

  await ctx.writeTurn();
  await ctx.writeTurn();
  await ctx.writeTurn();
  await ctx.check();

  const result = await ctx.check();

  expect(result).toBe('stopped');
});

test('it ends the step when the stop stands for a reason other than turns', async () => {
  const ctx = await setupTest();

  await writeSpendTrip(ctx.context, { reason: 'lost', at: ctx.clock.now() });

  const result = await ctx.check();

  expect(result).toBe('stopped');
});
