import { withWriteTransaction } from '@heynixie/log';
import type { SpendContext } from '../types';
import type { TripPayload } from './pick-spend-move';
import { writeSpendTripInTransaction } from './write-spend-trip-in-transaction';

export function writeSpendTrip(context: SpendContext, trip: TripPayload): Promise<boolean> {
  return withWriteTransaction(context.log.writer, (tx) =>
    writeSpendTripInTransaction(tx, context, trip),
  );
}
