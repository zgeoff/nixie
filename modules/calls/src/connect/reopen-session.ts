import { publishChanged, withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { startCallWatch } from '../hand-off/start-call-watch';
import { callReconnectedCodec } from '../record/call-reconnected-codec';
import type { CallsContext, ReconnectCause, SpeechLayer } from '../types';
import { closeSpeechSession } from '../utils/close-speech-session';
import { readCall } from '../utils/read-call';
import type { ConnectCall, ConnectResult } from './connect-call';

interface ReopenTerms {
  readonly voice: string;
}

// Moves a live call to a new speech session from the device's new offer, and charges nothing. A
// refused or failed open leaves the call as it was, so the device may try again until the call's
// wait runs out. The old session closes once the new one is in place.
export async function reopenSession(
  context: CallsContext,
  speech: SpeechLayer,
  input: ConnectCall,
  terms: ReopenTerms,
): Promise<ConnectResult> {
  const instructions = await context.readInstructions(input.callID);

  if (!(await input.probeCaller(context.log.writer.db))) {
    return { status: 'refused', error: 'SESSION_REVOKED' };
  }

  const opened = await speech.open({
    sdpOffer: input.sdpOffer,
    instructions,
    voice: terms.voice,
  });

  if ('error' in opened) {
    return { status: 'refused', error: opened.error };
  }

  const oldSessionID = context.sessions.get(input.callID);
  const cause = context.runtime.reconnects.get(input.callID)?.cause ?? 'restart';

  const outcome = await swapSession(context, input, { sessionID: opened.sessionID, cause }).catch(
    async (error: unknown) => {
      restoreSession(context, input.callID, oldSessionID);

      await closeSpeechSession(context, {
        callID: input.callID,
        sessionID: opened.sessionID,
        isBudgetEnd: false,
      });

      throw error;
    },
  );

  if (outcome !== 'swapped') {
    restoreSession(context, input.callID, oldSessionID);

    await closeSpeechSession(context, {
      callID: input.callID,
      sessionID: opened.sessionID,
      isBudgetEnd: false,
    });

    return {
      status: 'refused',
      error: outcome === 'revoked' ? 'SESSION_REVOKED' : 'CALL_NOT_FOUND',
    };
  }

  context.runtime.reconnects.delete(input.callID);
  context.runtime.watches.get(input.callID)?.abort();
  dropHandOffs(context, input.callID);

  const live = await readCall(context.log.writer.db, input.callID);

  if (live !== null) {
    startCallWatch(context, live, opened.sessionID);
  }

  if (oldSessionID !== undefined && oldSessionID !== opened.sessionID) {
    await closeSpeechSession(context, {
      callID: input.callID,
      sessionID: oldSessionID,
      isBudgetEnd: false,
    });
  }

  await sayReconnectLine(context, speech, input.callID, opened.sessionID);

  publishChanged(context.log.writer, ['calls']);

  return { status: 'connected', sdpAnswer: opened.sdpAnswer };
}

type SwapOutcome = 'swapped' | 'revoked' | 'gone';

interface NextSession {
  readonly sessionID: string;
  readonly cause: ReconnectCause;
}

function swapSession(
  context: CallsContext,
  input: ConnectCall,
  next: NextSession,
): Promise<SwapOutcome> {
  return withWriteTransaction(context.log.writer, async (tx): Promise<SwapOutcome> => {
    if (!(await input.probeCaller(tx))) {
      return 'revoked';
    }

    const current = await readCall(tx, input.callID);

    if (current === null || current.state !== 'live') {
      return 'gone';
    }

    // set before the commit, so the sweep never sees a live call with no session
    context.sessions.set(input.callID, next.sessionID);

    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: callReconnectedCodec.kind,
        definitions: context.definitions(),
        thread: current.taskID,
        payload: callReconnectedCodec.encode({ callID: input.callID, cause: next.cause }),
      },
    ]);

    return 'swapped';
  });
}

function restoreSession(
  context: CallsContext,
  callID: string,
  oldSessionID: string | undefined,
): void {
  if (oldSessionID === undefined) {
    context.sessions.delete(callID);
  } else {
    context.sessions.set(callID, oldSessionID);
  }
}

// A hand-off belongs to the speech session that made it, and the new session knows none of them.
// Its answer is never sent, as after a restart, so no request is answered in a session that never
// heard it.
function dropHandOffs(context: CallsContext, callID: string): void {
  for (const handOff of context.runtime.handOffs.get(callID)?.values() ?? []) {
    handOff.holding.abort();
  }

  context.runtime.handOffs.delete(callID);
}

async function sayReconnectLine(
  context: CallsContext,
  speech: SpeechLayer,
  callID: string,
  sessionID: string,
): Promise<void> {
  try {
    await speech.say(sessionID, context.readVoiceDefinitions().lines.reconnect);
  } catch (error) {
    context.logEvent('calls.session_say_failed', {
      callID,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
