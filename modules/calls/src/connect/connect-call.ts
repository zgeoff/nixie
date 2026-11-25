import { withWriteTransaction } from '@heynixie/log';
import type { Kysely } from 'kysely';
import type { CallsContext, OpenedSpeech, SpeechLayer } from '../types';
import { chargeCallMinute } from '../utils/charge-call-minute';
import { closeSpeechSession } from '../utils/close-speech-session';
import { endCall } from '../utils/end-call';
import { readCall } from '../utils/read-call';

export type ConnectRefusal =
  | 'CALL_NOT_FOUND'
  | 'NOT_CARRYING_SESSION'
  | 'CALL_CONNECTED'
  | 'SPEECH_UNAVAILABLE'
  | 'VOICE_PRICE_MISSING'
  | 'VOICE_CREDENTIAL_REFUSED'
  | 'CALL_BUDGET_REACHED'
  | 'SESSION_REVOKED';

export type ConnectResult =
  | { readonly status: 'connected'; readonly sdpAnswer: string }
  | { readonly status: 'refused'; readonly error: ConnectRefusal };

export interface ConnectCall {
  readonly callID: string;

  // the identity ID of the device session that asks
  readonly session: string;
  readonly sdpOffer: string;

  // Says that the asking session is still live. It runs before the speech session opens and
  // again in the transaction that moves the call to live, so a session revoked in between never
  // connects.
  readonly probeCaller: (db: Kysely<unknown>) => Promise<boolean>;
}

// Opens the call's speech session from the device's offer, and charges the call's first minute in
// the transaction that moves the call to live. A session the provider refuses ends the call as
// dropped, and a first minute that no budget has room for ends it as budget.
export async function connectCall(
  context: CallsContext,
  input: ConnectCall,
): Promise<ConnectResult> {
  const call = await readCall(context.log.writer.db, input.callID);

  const voice = context.readVoiceDefinitions();

  if (call === null || call.state === 'ended' || call.state === 'ringing') {
    return { status: 'refused', error: 'CALL_NOT_FOUND' };
  }

  if (call.carryingSession !== input.session) {
    return { status: 'refused', error: 'NOT_CARRYING_SESSION' };
  }

  if (
    call.state === 'live' ||
    context.sessions.has(input.callID) ||
    context.openings.has(input.callID)
  ) {
    return { status: 'refused', error: 'CALL_CONNECTED' };
  }

  if (context.speech === null) {
    return { status: 'refused', error: 'SPEECH_UNAVAILABLE' };
  }

  if (voice.pricePerMinuteMicros === null) {
    return { status: 'refused', error: 'VOICE_PRICE_MISSING' };
  }

  // The claim follows the check with no wait between, so 2 connects never both pass it.
  context.openings.add(input.callID);

  try {
    return await openAndCharge(context, context.speech, input, {
      voice: voice.voice,
      pricePerMinuteMicros: voice.pricePerMinuteMicros,
    });
  } finally {
    context.openings.delete(input.callID);
  }
}

interface ConnectTerms {
  readonly voice: string;
  readonly pricePerMinuteMicros: number;
}

async function openAndCharge(
  context: CallsContext,
  speech: SpeechLayer,
  input: ConnectCall,
  terms: ConnectTerms,
): Promise<ConnectResult> {
  if (!(await input.probeCaller(context.log.writer.db))) {
    return { status: 'refused', error: 'SESSION_REVOKED' };
  }

  const opened = await speech.open({
    sdpOffer: input.sdpOffer,
    instructions: await context.readInstructions(input.callID),
    voice: terms.voice,
  });

  if ('error' in opened) {
    if (opened.error === 'VOICE_CREDENTIAL_REFUSED') {
      await endCall(context, input.callID, 'dropped');
    }

    return { status: 'refused', error: opened.error };
  }

  const outcome = await chargeFirstMinute(context, input, terms, opened);

  if (outcome === 'charged') {
    return { status: 'connected', sdpAnswer: opened.sdpAnswer };
  }

  if (outcome === 'budget') {
    await endCall(context, input.callID, 'budget');

    return { status: 'refused', error: 'CALL_BUDGET_REACHED' };
  }

  await closeSpeechSession(context, {
    callID: input.callID,
    sessionID: opened.sessionID,
    isBudgetEnd: false,
  });

  if (outcome === 'revoked') {
    return { status: 'refused', error: 'SESSION_REVOKED' };
  }

  return { status: 'refused', error: outcome === 'gone' ? 'CALL_NOT_FOUND' : 'CALL_CONNECTED' };
}

type ChargeOutcome = 'charged' | 'budget' | 'revoked' | 'gone' | 'connected';

// A session that no connect keeps, because the charge threw, closes before the error goes on.
async function chargeFirstMinute(
  context: CallsContext,
  input: ConnectCall,
  terms: ConnectTerms,
  opened: OpenedSpeech,
): Promise<ChargeOutcome> {
  try {
    return await withWriteTransaction(context.log.writer, async (tx): Promise<ChargeOutcome> => {
      if (!(await input.probeCaller(tx))) {
        return 'revoked';
      }

      const current = await readCall(tx, input.callID);

      if (current === null || current.state === 'ended' || current.state === 'ringing') {
        return 'gone';
      }

      if (current.state === 'live') {
        return 'connected';
      }

      // set before the commit, so the sweep never sees a live call with no session
      context.sessions.set(input.callID, opened.sessionID);

      const reached = await chargeCallMinute(tx, context, {
        callID: input.callID,
        pricePerMinuteMicros: terms.pricePerMinuteMicros,
      });

      return reached === null ? 'charged' : 'budget';
    });
  } catch (error) {
    context.sessions.delete(input.callID);

    await closeSpeechSession(context, {
      callID: input.callID,
      sessionID: opened.sessionID,
      isBudgetEnd: false,
    });

    throw error;
  }
}
