import { withWriteTransaction } from '@heynixie/log';
import type { CallsContext } from '../types';
import { chargeOwedMinutes } from '../utils/charge-owed-minutes';
import { endCall } from '../utils/end-call';
import { readEndedCallsSince, readOpenCalls } from '../utils/read-call';
import { pickCallMoves } from './pick-call-moves';
import type { CallMove } from './pick-call-moves';

// How far back the sweep looks for an ended call whose task stopped before its last turn
const strandedReportWindowMs = 24 * 60 * 60 * 1000;

// One pass over the open calls: each charge a call has come due, and each end that the pick
// names. Then a call that ended in the last day, whose task stopped before its last turn, gets
// its report.
export async function runCallSweep(context: CallsContext): Promise<void> {
  const calls = await readOpenCalls(context.log.writer.db);

  const moves = pickCallMoves(calls, {
    nowMs: context.clock.now(),
    sessionCallIDs: new Set(context.sessions.keys()),
  });

  for (const move of moves) {
    await runMove(context, move);
  }

  const ended = await readEndedCallsSince(
    context.log.writer.db,
    context.clock.now() - strandedReportWindowMs,
  );

  for (const call of ended) {
    await withWriteTransaction(context.log.writer, (tx) => context.writeStrandedReport(tx, call));
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
