import { withWriteTransaction } from '@heynixie/log';
import type { Kysely } from 'kysely';
import type { TripPayload } from '../stop/pick-spend-move';
import { readSpendRaise } from '../stop/read-spend-raise';
import { readSpendStopRow } from '../stop/read-spend-stop-row';
import { readSpendTurns } from '../stop/read-spend-turns';
import { writeSpendTripInTransaction } from '../stop/write-spend-trip-in-transaction';
import { buildSpendPeriods } from '../time/build-spend-periods';
import type { SpendContext } from '../types';
import { pickTurnTrip } from './pick-turn-trip';

// The check before each step's turn: 'stopped' when the stop stands for any reason, or when the
// turn count has reached a limit, which trips the stop. It reads no gateway. A trip reads the day
// again inside its transaction, so a raise or midnight after the first read trips nothing.
export async function checkSpendTurns(context: SpendContext): Promise<'open' | 'stopped'> {
  const db = context.log.writer.db;

  const [standing, trip] = await Promise.all([readSpendStopRow(db), readTurnTripNow(context, db)]);

  if (standing !== null) {
    return 'stopped';
  }

  if (trip === null) {
    return 'open';
  }

  return withWriteTransaction(context.log.writer, async (tx) => {
    const [held, current] = await Promise.all([readSpendStopRow(tx), readTurnTripNow(context, tx)]);

    if (held !== null) {
      return 'stopped';
    }

    if (current === null) {
      return 'open';
    }

    await writeSpendTripInTransaction(tx, context, current);

    return 'stopped';
  });
}

async function readTurnTripNow(
  context: SpendContext,
  db: Kysely<unknown>,
): Promise<TripPayload | null> {
  const now = context.clock.now();
  const periods = buildSpendPeriods(now, context.zone);

  const [turns, raise] = await Promise.all([
    readSpendTurns(db, { dayMs: periods.day.startMs, monthMs: periods.month.startMs }),
    readSpendRaise(db, periods.day.start),
  ]);

  return pickTurnTrip({ turns, raise, limits: context.limits, periods, now });
}
