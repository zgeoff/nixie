import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { conversationTaskID } from '@heynixie/tasks';
import type { CallsContext } from '../types';
import type { CallEndedBy } from './call-ended-by';
import { callEndedCodec } from './call-ended-codec';
import { readCall } from './read-call';

// Ends the call once: the ended record goes on the conversation's thread, and the speech session
// closes after it commits. A call that is over, or that no call has, ends nothing. For a call that
// the budget ends, the speech layer first says the budget line.
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

    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: callEndedCodec.kind,
        definitions: context.definitions(),
        thread: conversationTaskID,
        payload: callEndedCodec.encode({ callID, endedBy, minutes: call.minutes }),
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
  const speech = context.speech;

  context.sessions.delete(callID);

  if (sessionID === undefined || speech === null) {
    return;
  }

  try {
    if (endedBy === 'budget') {
      await speech.say(sessionID, context.readVoiceDefinitions().lines.budget);
    }

    await speech.close(sessionID);
  } catch (error) {
    context.logEvent('calls.session_close_failed', {
      callID,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
