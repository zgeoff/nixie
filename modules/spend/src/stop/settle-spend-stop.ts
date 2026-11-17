import { withWriteTransaction } from '@heynixie/log';
import type { SpendContext, SpendStop } from '../types';
import { pickSpendMove } from './pick-spend-move';
import type { SpendFacts } from './pick-spend-stop';
import { pickSpendStop } from './pick-spend-stop';
import { readSpendStopRow } from './read-spend-stop-row';
import { writeSpendClear } from './write-spend-clear';
import { writeSpendClearInTransaction } from './write-spend-clear-in-transaction';
import { writeSpendTrip } from './write-spend-trip';
import { writeSpendTripInTransaction } from './write-spend-trip-in-transaction';

// Brings the log's stop in line with the facts, and returns what the stop is. The watcher calls it
// each poll, and a raise calls it so that the stop clears with the raise.
export async function settleSpendStop(
  context: SpendContext,
  facts: SpendFacts,
): Promise<SpendStop> {
  const stop = pickSpendStop(facts);

  const standing = await readSpendStopRow(context.log.writer.db);

  const move = pickSpendMove(standing, stop, facts.now);

  if (move.clear !== null && move.trip !== null) {
    // A stop that replaces another never shows an open state between the two.
    const clear = move.clear;
    const trip = move.trip;

    await withWriteTransaction(context.log.writer, async (tx) => {
      await writeSpendClearInTransaction(tx, context, clear);
      await writeSpendTripInTransaction(tx, context, trip);
    });
  } else if (move.clear !== null) {
    await writeSpendClear(context, move.clear);
  } else if (move.trip !== null) {
    await writeSpendTrip(context, move.trip);
  }

  return stop;
}
