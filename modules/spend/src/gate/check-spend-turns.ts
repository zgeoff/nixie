import { readSpendRaise } from '../stop/read-spend-raise';
import { readSpendStopRow } from '../stop/read-spend-stop-row';
import { readSpendTurns } from '../stop/read-spend-turns';
import { writeSpendTrip } from '../stop/write-spend-trip';
import { buildSpendPeriods } from '../time/build-spend-periods';
import type { SpendContext } from '../types';
import { pickTurnTrip } from './pick-turn-trip';

// How long a step that finds the stop waits before it ends. A task that is exempt from a pause by
// its owner stays claimable while the stop stands, and a step that ends at once would be claimed
// again at once.
export const stoppedStepDelayMs = 2000;

// The check before each step's turn: 'stopped' when the stop stands for any reason, or when the
// turn count has reached a limit, which trips the stop. It reads no gateway.
export async function checkSpendTurns(context: SpendContext): Promise<'open' | 'stopped'> {
  const now = context.clock.now();
  const periods = buildSpendPeriods(now, context.zone);
  const db = context.log.writer.db;

  const [standing, turns, raise] = await Promise.all([
    readSpendStopRow(db),
    readSpendTurns(db, { dayMs: periods.day.startMs, monthMs: periods.month.startMs }),
    readSpendRaise(db, periods.day.start),
  ]);

  if (standing !== null) {
    return 'stopped';
  }

  const trip = pickTurnTrip({ turns, raise, limits: context.limits, periods, now });

  if (trip === null) {
    return 'open';
  }

  await writeSpendTrip(context, trip);

  return 'stopped';
}
