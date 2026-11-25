import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { conversationTaskID } from '@heynixie/tasks';
import type { CallsContext } from '../types';
import type { CallEndedBy } from './call-ended-by';
import { callEndedCodec } from './call-ended-codec';
import { chargeOwedMinutes } from './charge-owed-minutes';
import { closeSpeechSession } from './close-speech-session';
import { readCall } from './read-call';

// Ends the call once: the ended record goes on the conversation's thread, and the speech session
// closes after it commits. A call that is over ends nothing. The transaction first charges each
// started minute that is unpaid, unless a budget ended the call.
export async function endCall(
  context: CallsContext,
  callID: string,
  endedBy: CallEndedBy,
): Promise<boolean> {
  const isEnded = await withWriteTransaction(context.log.writer, async (tx) => {
    const call = await readCall(tx, callID);

    if (call === null || call.state === 'ended') {
      return false;
    }

    const price = context.readVoiceDefinitions().pricePerMinuteMicros;

    const paid =
      endedBy === 'budget' || price === null
        ? { charged: 0 }
        : await chargeOwedMinutes(tx, context, { callID, pricePerMinuteMicros: price });

    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: callEndedCodec.kind,
        definitions: context.definitions(),
        thread: conversationTaskID,
        payload: callEndedCodec.encode({
          callID,
          endedBy,
          minutes: call.minutes + paid.charged,
        }),
      },
    ]);

    return true;
  });

  if (isEnded) {
    await closeSession(context, callID, endedBy);
  }

  return isEnded;
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
