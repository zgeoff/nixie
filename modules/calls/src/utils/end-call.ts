import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { conversationTaskID } from '@heynixie/tasks';
import type { CallsContext } from '../types';
import { callClosingCodec } from './call-closing-codec';
import type { CallEndedBy } from './call-ended-by';
import { callEndedCodec } from './call-ended-codec';
import { chargeOwedMinutes } from './charge-owed-minutes';
import { closeSpeechSession } from './close-speech-session';
import { readCall } from './read-call';

// Ends the call once, or null when it was over. The ended record goes on the conversation's thread
// and the speech session closes after it commits. The transaction first charges each unpaid
// started minute, and a budget with no room for one makes the call end as budget.
export async function endCall(
  context: CallsContext,
  callID: string,
  endedBy: CallEndedBy,
): Promise<CallEndedBy | null> {
  const ended = await withWriteTransaction(context.log.writer, async (tx) => {
    const call = await readCall(tx, callID);

    if (call === null || call.state === 'ended') {
      return null;
    }

    const price = context.readVoiceDefinitions().pricePerMinuteMicros;

    const paid =
      endedBy === 'budget' || price === null
        ? { charged: 0, isReached: false }
        : await chargeOwedMinutes(tx, context, { callID, pricePerMinuteMicros: price });

    const finalEndedBy = paid.isReached ? 'budget' : endedBy;

    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: callClosingCodec.kind,
        definitions: context.definitions(),
        thread: call.taskID,
        payload: callClosingCodec.encode({ callID }),
      },
      {
        kind: callEndedCodec.kind,
        definitions: context.definitions(),
        thread: conversationTaskID,
        payload: callEndedCodec.encode({
          callID,
          endedBy: finalEndedBy,
          minutes: call.minutes + paid.charged,
        }),
      },
    ]);

    return finalEndedBy;
  });

  if (ended !== null) {
    stopWatch(context, callID);

    await closeSession(context, callID, ended);
  }

  return ended;
}

function stopWatch(context: CallsContext, callID: string): void {
  context.runtime.watches.get(callID)?.abort();
  context.runtime.watches.delete(callID);
  context.runtime.handOffs.delete(callID);
  context.runtime.smallTalk.delete(callID);
}

async function closeSession(
  context: CallsContext,
  callID: string,
  endedBy: CallEndedBy,
): Promise<void> {
  const sessionID = context.sessions.get(callID);

  context.sessions.delete(callID);

  if (sessionID !== undefined) {
    await closeSpeechSession(context, { callID, sessionID, isBudgetEnd: endedBy === 'budget' });
  }
}
