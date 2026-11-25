import { withWriteTransaction } from '@heynixie/log';
import type { CallsContext } from '../types';
import { chargeCallMinute } from '../utils/charge-call-minute';
import { endCall } from '../utils/end-call';
import { readCall } from '../utils/read-call';

export type ConnectRefusal =
  | 'CALL_NOT_FOUND'
  | 'NOT_CARRYING_SESSION'
  | 'CALL_CONNECTED'
  | 'SPEECH_UNAVAILABLE'
  | 'VOICE_PRICE_MISSING'
  | 'VOICE_CREDENTIAL_REFUSED'
  | 'CALL_BUDGET_REACHED';

export type ConnectResult =
  | { readonly status: 'connected'; readonly sdpAnswer: string }
  | { readonly status: 'refused'; readonly error: ConnectRefusal };

export interface ConnectCall {
  readonly callID: string;

  // the identity ID of the device session that asks
  readonly session: string;
  readonly sdpOffer: string;
}

// Opens the call's speech session from the device's offer, and charges the call's first minute in
// the transaction that moves the call to live. A session the provider refuses ends the call as
// dropped, and a first minute that no budget has room for ends it as budget.
export async function connectCall(
  context: CallsContext,
  input: ConnectCall,
): Promise<ConnectResult> {
  const call = await readCall(context.log.writer.db, input.callID);

  const speech = context.speech;
  const voice = context.readVoiceDefinitions();

  if (call === null || call.state === 'ended') {
    return { status: 'refused', error: 'CALL_NOT_FOUND' };
  }

  if (call.carryingSession !== input.session) {
    return { status: 'refused', error: 'NOT_CARRYING_SESSION' };
  }

  if (call.state === 'live') {
    return { status: 'refused', error: 'CALL_CONNECTED' };
  }

  if (speech === null) {
    return { status: 'refused', error: 'SPEECH_UNAVAILABLE' };
  }

  const price = voice.pricePerMinuteMicros;

  if (price === null) {
    return { status: 'refused', error: 'VOICE_PRICE_MISSING' };
  }

  const opened = await speech.open({
    sdpOffer: input.sdpOffer,
    instructions: await context.readInstructions(input.callID),
    voice: voice.voice,
  });

  if ('error' in opened) {
    if (opened.error === 'VOICE_CREDENTIAL_REFUSED') {
      await endCall(context, input.callID, 'dropped');
    }

    return { status: 'refused', error: opened.error };
  }

  const outcome = await withWriteTransaction(context.log.writer, async (tx) => {
    const current = await readCall(tx, input.callID);

    if (current?.state !== 'connecting') {
      return 'not_connecting' as const;
    }

    // set before the commit, so the sweep never sees a live call with no session
    context.sessions.set(input.callID, opened.sessionID);

    const reached = await chargeCallMinute(tx, context, {
      callID: input.callID,
      pricePerMinuteMicros: price,
    });

    return reached === null ? ('charged' as const) : ('budget' as const);
  });

  if (outcome === 'charged') {
    return { status: 'connected', sdpAnswer: opened.sdpAnswer };
  }

  if (outcome === 'budget') {
    await endCall(context, input.callID, 'budget');

    return { status: 'refused', error: 'CALL_BUDGET_REACHED' };
  }

  await speech.close(opened.sessionID);

  return { status: 'refused', error: 'CALL_CONNECTED' };
}
