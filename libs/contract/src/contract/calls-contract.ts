import { z } from 'zod';
import { reusedIDErrors } from './reused-id-errors';
import { signedIn } from './signed-in';

const checkedAction = signedIn.errors(reusedIDErrors);
const callIDSchema = z.string().min(1).max(64);
const callStateSchema = z.enum(['ringing', 'connecting', 'live', 'ended']);

const speechUnavailable = {
  SPEECH_UNAVAILABLE: { message: 'This nixie has no speech layer to call through', status: 503 },
};

const budgetReached = {
  CALL_BUDGET_REACHED: { message: 'A call budget has no room for another minute', status: 409 },
};

export const callsContract = {
  // Starts a call that the calling device session carries. A refused start writes nothing.
  start: checkedAction
    .errors({
      ...speechUnavailable,
      ...budgetReached,
      VOICE_OFF: { message: 'Voice calls are off on this nixie', status: 409 },
      VOICE_PRICE_MISSING: {
        message: 'voice/voice.yaml in the definitions has no price_per_minute',
        status: 409,
      },
      CALL_RUNNING: { message: 'A call is already running', status: 409 },
    })
    .input(z.object({ clientActionID: z.uuid() }))
    .output(z.object({ callID: callIDSchema, state: z.literal('connecting') })),

  // Opens the call's speech session from the device's WebRTC offer, from the carrying session
  // alone. The first minute of the call charges here.
  connect: signedIn
    .errors({
      ...speechUnavailable,
      ...budgetReached,
      CALL_NOT_FOUND: { message: 'No call has this ID', status: 404 },
      VOICE_PRICE_MISSING: {
        message: 'voice/voice.yaml in the definitions has no price_per_minute',
        status: 409,
      },
      NOT_CARRYING_SESSION: { message: 'This device session does not carry the call', status: 403 },
      CALL_CONNECTED: { message: 'The call is already connected', status: 409 },
      VOICE_CREDENTIAL_REFUSED: {
        message: 'The speech provider refused the deployment credential',
        status: 502,
      },
    })
    .input(z.object({ callID: callIDSchema, sdpOffer: z.string().min(1).max(65_536) }))
    .output(z.object({ sdpAnswer: z.string().min(1) })),

  // Ends the call from the device side. A call that has ended answers the same way.
  hangUp: checkedAction
    .errors({ CALL_NOT_FOUND: { message: 'No call has this ID', status: 404 } })
    .input(z.object({ callID: callIDSchema, clientActionID: z.uuid() }))
    .output(z.object({ callID: callIDSchema, state: callStateSchema })),
};
