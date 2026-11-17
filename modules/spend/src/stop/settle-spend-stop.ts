import type { SpendContext, SpendStop } from '../types';
import { pickSpendMove } from './pick-spend-move';
import type { SpendFacts } from './pick-spend-stop';
import { pickSpendStop } from './pick-spend-stop';
import { readSpendStopRow } from './read-spend-stop-row';
import { writeSpendClear } from './write-spend-clear';
import { writeSpendTrip } from './write-spend-trip';

// Brings the log's stop in line with the facts, and returns what the stop is. The watcher calls it
// each poll, and a raise calls it so that the stop clears with the raise.
export async function settleSpendStop(
  context: SpendContext,
  facts: SpendFacts,
): Promise<SpendStop> {
  const stop = pickSpendStop(facts);

  const standing = await readSpendStopRow(context.log.writer.db);

  const move = pickSpendMove(standing, stop, facts.now);

  if (move.clear !== null) {
    await writeSpendClear(context, move.clear);
  }

  if (move.trip !== null) {
    await writeSpendTrip(context, move.trip);
  }

  return stop;
}
