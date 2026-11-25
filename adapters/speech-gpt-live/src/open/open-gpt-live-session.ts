import type { OpenSpeech, OpenedSpeech, SpeechRefused } from '@heynixie/calls';
import { parseJSONOrNull } from '@heynixie/wire';
import { acknowledgementDelayMs, sidebandOpenLimitMs } from '../constants';
import { gptLiveEventSchema } from '../event/gpt-live-event-schema';
import { runGPTLiveEvent } from '../event/run-gpt-live-event';
import { scheduleSessionEnding } from '../event/schedule-session-ending';
import { buildGPTLiveSession } from '../session/build-gpt-live-session';
import { endGPTLiveSession } from '../session/end-gpt-live-session';
import { raiseSpeechEvent } from '../session/raise-speech-event';
import type { GPTLiveOptions, GPTLiveSession, SidebandSocket } from '../types';
import { createdSessionSchema } from './created-session-schema';

export type OpenedGPTLive =
  | { readonly kind: 'opened'; readonly opened: OpenedSpeech; readonly session: GPTLiveSession }
  | { readonly kind: 'refused'; readonly refusal: SpeechRefused };

// Creates the session from the device's offer with the deployment's key, joins it on the sideband,
// and starts reading its events. The session's data channel lets the device neither send an event
// nor receive one, so the device reads no instructions and sends no command.
export async function openGPTLiveSession(
  options: GPTLiveOptions,
  input: OpenSpeech,
): Promise<OpenedGPTLive> {
  const created = await createSession(options, input);

  if ('refusal' in created) {
    return { kind: 'refused', refusal: created.refusal };
  }

  const socket = await attachSideband(options, created.sessionID);

  if (socket === null) {
    return { kind: 'refused', refusal: { error: 'SPEECH_UNAVAILABLE' } };
  }

  const session = buildGPTLiveSession(created.sessionID, socket);

  // The session reports its own expiry in `session.started`, which the sideband replays at attach.
  scheduleSessionEnding(options, session, undefined);
  void readSideband(options, session);

  return {
    kind: 'opened',
    opened: { sdpAnswer: created.sdpAnswer, sessionID: created.sessionID },
    session,
  };
}

async function createSession(
  options: GPTLiveOptions,
  input: OpenSpeech,
): Promise<
  { readonly sessionID: string; readonly sdpAnswer: string } | { refusal: SpeechRefused }
> {
  const response = await options
    .fetch(`${options.apiURL}/v1/live/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        session: {
          model: options.model,
          instructions: input.instructions,
          audio: { output: { voice: input.voice } },
          delegation: { type: 'client', acknowledgement_delay_ms: acknowledgementDelayMs },
          store: false,
          client: { data_channel: { allowed_client_events: [], allowed_server_events: [] } },
        },
        transport: { type: 'webrtc', sdp: input.sdpOffer },
      }),
    })
    .catch((error: unknown) => error);

  if (!(response instanceof Response)) {
    options.logEvent(
      'calls.speech_open_failed',
      { reason: response instanceof Error ? response.message : String(response) },
      'warn',
    );

    return { refusal: { error: 'SPEECH_UNAVAILABLE' } };
  }

  const text = await response.text();

  if (response.status === 401 || response.status === 403) {
    return { refusal: { error: 'VOICE_CREDENTIAL_REFUSED' } };
  }

  const parsed = createdSessionSchema.safeParse(parseJSONOrNull(text));

  if (response.status !== 201 || !parsed.success) {
    options.logEvent('calls.speech_open_failed', { status: response.status }, 'warn');

    return { refusal: { error: 'SPEECH_UNAVAILABLE' } };
  }

  return { sessionID: parsed.data.session.id, sdpAnswer: parsed.data.transport.sdp };
}

async function attachSideband(
  options: GPTLiveOptions,
  sessionID: string,
): Promise<SidebandSocket | null> {
  const url = new URL(`${options.apiURL}/v1/live/sessions/${sessionID}/attach`);

  url.protocol = 'wss:';

  const attempt = new AbortController();
  const opened = new AbortController();

  void abortSlowAttempt(options, attempt, opened.signal);

  try {
    return await options.fetch.openSocket(url.href, { signal: attempt.signal });
  } catch (error) {
    options.logEvent(
      'calls.speech_attach_failed',
      { sessionID, reason: error instanceof Error ? error.message : String(error) },
      'warn',
    );

    return null;
  } finally {
    opened.abort();
  }
}

// A site that takes the connection and never answers the upgrade would otherwise hold the open for
// ever. The attempt's signal aborts the handshake and never an open socket, because the caller
// stops waiting once the attempt ends.
async function abortSlowAttempt(
  options: GPTLiveOptions,
  attempt: AbortController,
  finished: AbortSignal,
): Promise<void> {
  await options.clock.sleep(sidebandOpenLimitMs, finished);

  if (!finished.aborted) {
    attempt.abort(new Error('the sideband did not open in time'));
  }
}

// Reads the sideband until it ends. A stream that ends with no close asked for is a dropped session.
async function readSideband(options: GPTLiveOptions, session: GPTLiveSession): Promise<void> {
  try {
    for await (const text of session.socket.messages) {
      const parsed = gptLiveEventSchema.safeParse(parseJSONOrNull(text));

      if (parsed.success) {
        runGPTLiveEvent(options, session, parsed.data);
      }
    }
  } catch (error) {
    options.logEvent(
      'calls.speech_sideband_failed',
      {
        sessionID: session.sessionID,
        reason: error instanceof Error ? error.message : String(error),
      },
      'warn',
    );
  }

  if (!session.isClosing) {
    raiseSpeechEvent(session, { kind: 'dropped' });
  }

  endGPTLiveSession(session);
}
