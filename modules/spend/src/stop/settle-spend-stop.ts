import { withWriteTransaction } from '@heynixie/log';
import type { SpendContext, SpendStop } from '../types';
import { pickSpendMove } from './pick-spend-move';
import type { SpendFacts } from './pick-spend-stop';
import { pickSpendStop } from './pick-spend-stop';
import { readSpendStopRow } from './read-spend-stop-row';
import { settleRouteStopsInTransaction } from './settle-route-stops-in-transaction';
import { writeSpendClearInTransaction } from './write-spend-clear-in-transaction';
import { writeSpendTripInTransaction } from './write-spend-trip-in-transaction';

// Brings the log's stop and each route's stop in line with the facts, in one transaction, and
// returns what the stop is. The watcher calls it each poll, and a raise calls it so that the stop
// clears with the raise. A stop that replaces another never shows an open state between the two.
export async function settleSpendStop(
  context: SpendContext,
  facts: SpendFacts,
): Promise<SpendStop> {
  const stop = pickSpendStop(facts);

  await withWriteTransaction(context.log.writer, async (tx) => {
    const standing = await readSpendStopRow(tx);

    const move = pickSpendMove(standing, stop, facts.now);

    if (move.clear !== null) {
      await writeSpendClearInTransaction(tx, context, move.clear);
    }

    if (move.trip !== null) {
      await writeSpendTripInTransaction(tx, context, move.trip);
    }

    await settleRouteStopsInTransaction(tx, context, facts);
  });

  return stop;
}
