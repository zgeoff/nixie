import type { SpendContext, SpendStop } from '../types';
import { pickSpendMove } from './pick-spend-move';
import type { SpendFacts } from './pick-spend-stop';
import { pickSpendStop } from './pick-spend-stop';
import { readSpendRaise } from './read-spend-raise';
import { readSpendStopRow } from './read-spend-stop-row';
import { readSpendTurns } from './read-spend-turns';
import { settleRouteStopsInTransaction } from './settle-route-stops-in-transaction';
import { withSettleTransaction } from './with-settle-transaction';
import { writeSpendClearInTransaction } from './write-spend-clear-in-transaction';
import { writeSpendTripInTransaction } from './write-spend-trip-in-transaction';

// Brings the log's stop and each route's stop in line with the facts, in one transaction, and
// returns what the stop is. It reads the turn count and the raise again inside the transaction, so
// facts read before a raise of turns never put back the stop that raise cleared.
export function settleSpendStop(context: SpendContext, facts: SpendFacts): Promise<SpendStop> {
  return withSettleTransaction(context, async (tx) => {
    const [turns, raise, standing] = await Promise.all([
      readSpendTurns(tx, {
        dayMs: facts.periods.day.startMs,
        monthMs: facts.periods.month.startMs,
      }),
      readSpendRaise(tx, facts.periods.day.start),
      readSpendStopRow(tx),
    ]);

    const stop = pickSpendStop({ ...facts, turns, raise });
    const move = pickSpendMove(standing, stop, facts.now);

    if (move.clear !== null) {
      await writeSpendClearInTransaction(tx, context, move.clear);
    }

    if (move.trip !== null) {
      await writeSpendTripInTransaction(tx, context, move.trip);
    }

    await settleRouteStopsInTransaction(tx, context, facts);

    return stop;
  });
}
