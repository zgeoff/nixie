import { z } from 'zod';
import { featureOffErrors } from './feature-off-errors';
import { reusedIDErrors } from './reused-id-errors';
import { signedIn } from './signed-in';

const callsProcedure = signedIn.errors(featureOffErrors);
const checkedAction = callsProcedure.errors(reusedIDErrors);
const callIDSchema = z.string().min(1).max(64);
const callStateSchema = z.enum(['ringing', 'connecting', 'live', 'ended']);
const endedBySchema = z.enum(['you', 'nixie', 'budget', 'missed', 'declined', 'dropped']);
const reconnectCauseSchema = z.enum(['session_limit', 'dropped', 'restart']);

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
    .output(
      z.object({
        callID: callIDSchema,
        state: z.literal('connecting'),

        // the call's own thread, which its proposals sit on
        thread: z.string().min(1).max(200),
      }),
    ),

  // Reads one call as the carrying device needs it: its state, who ended it, and whether it waits
  // for a fresh `connect` because its speech session ended or went with a restart.
  get: callsProcedure
    .errors({ CALL_NOT_FOUND: { message: 'No call has this ID', status: 404 } })
    .input(z.object({ callID: callIDSchema }))
    .output(
      z.object({
        callID: callIDSchema,
        state: callStateSchema,
        endedBy: endedBySchema.nullable(),

        // set while a live call needs a new offer from the carrying device, with the reason
        reconnect: reconnectCauseSchema.nullable(),
      }),
    ),

  // Opens the call's speech session from the device's WebRTC offer, from the carrying session
  // alone. The first minute of the call charges here. On a live call that waits for a new offer,
  // it moves the call to the new session and charges nothing.
  connect: callsProcedure
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

  // Ends the call from the device side. A call that has ended answers the same way. `endedBy` is
  // `you` only when this request ended the call; a call the server ended first keeps its reason.
  hangUp: checkedAction
    .errors({ CALL_NOT_FOUND: { message: 'No call has this ID', status: 404 } })
    .input(z.object({ callID: callIDSchema, clientActionID: z.uuid() }))
    .output(z.object({ callID: callIDSchema, state: callStateSchema, endedBy: endedBySchema })),
};
