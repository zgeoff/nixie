import type { Transaction } from 'kysely';
import type { CallsContext } from '../types';
import { chargeCallMinute } from './charge-call-minute';
import { countOwedMinutes } from './count-owed-minutes';
import { readCall } from './read-call';

export interface OwedMinutes {
  readonly callID: string;
  readonly pricePerMinuteMicros: number;
}

// `charged` is the count of minutes this call paid. `isReached` says that a budget had no room for
// the next one, so the call owes more than it paid.
export interface ChargedMinutes {
  readonly charged: number;
  readonly isReached: boolean;
}

// Reads the call in the caller's transaction, so a call that ended since the caller looked owes
// nothing, and charges each started minute the call has not paid. The caller's commit keeps the
// minutes charged before a budget ran out.
export async function chargeOwedMinutes(
  tx: Transaction<unknown>,
  context: CallsContext,
  owed: OwedMinutes,
): Promise<ChargedMinutes> {
  const call = await readCall(tx, owed.callID);

  const count = call === null ? 0 : countOwedMinutes(call, context.clock.now());

  for (let charged = 0; charged < count; charged += 1) {
    const reached = await chargeCallMinute(tx, context, owed);

    if (reached !== null) {
      return { charged, isReached: true };
    }
  }

  return { charged: count, isReached: false };
}
