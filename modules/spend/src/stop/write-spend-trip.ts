import {
  pauseNixieInTransaction,
  withWriteTransaction,
  writeRecordsInTransaction,
} from '@heynixie/log';
import { spendStopTrippedCodec } from '../record/spend-stop-tripped-codec';
import type { SpendContext } from '../types';
import type { TripPayload } from './pick-spend-move';
import { readSpendStopRow } from './read-spend-stop-row';

// Writes the trip and, when nixie is not paused, pauses it with the cause spending, in one
// transaction. A stop that already stands takes no second trip, so the watcher and a step that
// both find the limit write one record. A paused nixie keeps its pause and its cause.
export function writeSpendTrip(context: SpendContext, trip: TripPayload): Promise<boolean> {
  return withWriteTransaction(context.log.writer, async (tx) => {
    if ((await readSpendStopRow(tx)) !== null) {
      return false;
    }

    const definitions = context.definitions();

    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: spendStopTrippedCodec.kind,
        definitions,
        payload: spendStopTrippedCodec.encode(trip),
      },
    ]);

    await pauseNixieInTransaction(tx, context.log, {
      cause: 'spending',
      recoveryID: null,
      by: null,
      definitions,
    });

    return true;
  });
}
