import { withWriteTransaction } from '@heynixie/log';
import type { CallsContext } from '../types';
import { chargeOwedMinutes } from '../utils/charge-owed-minutes';
import { endCall } from '../utils/end-call';
import { readOpenCalls } from '../utils/read-call';
import { pickCallMoves } from './pick-call-moves';
import type { CallMove } from './pick-call-moves';

// One pass over the open calls: each charge a call has come due, and each end that the pick
// names. A call that no budget has room for ends as budget, after the speech layer says so.
export async function runCallSweep(context: CallsContext): Promise<void> {
  const calls = await readOpenCalls(context.log.writer.db);

  const moves = pickCallMoves(calls, {
    nowMs: context.clock.now(),
    sessionCallIDs: new Set(context.sessions.keys()),
  });

  for (const move of moves) {
    await runMove(context, move);
  }
}

// A charge reads the call again inside its transaction, so a call that ended since the pick, or
// that another pass charged, owes only what is still due.
async function runMove(context: CallsContext, move: CallMove): Promise<void> {
  if (move.kind === 'end') {
    await endCall(context, move.callID, move.endedBy);

    return;
  }

  const price = context.readVoiceDefinitions().pricePerMinuteMicros;

  if (price === null) {
    await endCall(context, move.callID, 'dropped');

    return;
  }

  const paid = await withWriteTransaction(context.log.writer, (tx) =>
    chargeOwedMinutes(tx, context, { callID: move.callID, pricePerMinuteMicros: price }),
  );

  if (paid.isReached) {
    await endCall(context, move.callID, 'budget');
  }
}
