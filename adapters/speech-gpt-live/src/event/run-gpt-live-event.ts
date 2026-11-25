import { match } from 'ts-pattern';
import { quietMs } from '../constants';
import { endGPTLiveSession } from '../session/end-gpt-live-session';
import { raiseSpeechEvent } from '../session/raise-speech-event';
import { sendGPTLiveEvent } from '../session/send-gpt-live-event';
import { startQuietTimer } from '../session/start-quiet-timer';
import type { GPTLiveOptions, GPTLiveSession, SpokenLine } from '../types';
import { flushHeardSlices } from './flush-heard-slices';
import { flushTalkSlices } from './flush-talk-slices';
import type { GPTLiveEvent } from './gpt-live-event-schema';
import { joinSlices } from './join-slices';
import { scheduleSessionEnding } from './schedule-session-ending';
import { startCut } from './start-cut';

// Takes one event of the sideband into the session: the user's speech becomes `heard` events and
// hand-offs, the speech layer's own speech becomes `spoke` events, and a user who starts talking
// while an answer plays becomes a cut. Every other event is ignored.
export function runGPTLiveEvent(
  options: GPTLiveOptions,
  session: GPTLiveSession,
  event: GPTLiveEvent,
): void {
  if (event.event_id !== undefined) {
    // each attach opens with a replay of the events that came before it
    if (session.seenEventIDs.has(event.event_id)) {
      return;
    }

    session.seenEventIDs.add(event.event_id);
  }

  match(event)
    .with({ type: 'session.started' }, (started) => {
      scheduleSessionEnding(options, session, started.session?.expires_at);
    })
    .with({ type: 'session.input_transcript.delta' }, (input) => {
      runInputSlice(options, session, {
        text: input.delta,
        startMs: input.start_ms,
        endMs: input.end_ms,
      });
    })
    .with({ type: 'session.output_transcript.delta' }, (output) => {
      runOutputSlice(options, session, {
        text: output.delta,
        startMs: output.start_ms,
        endMs: output.end_ms,
      });
    })
    .with({ type: 'session.delegation.created' }, (created) => {
      runDelegation(session, created.delegation.id, created.offset_ms);
    })
    .with({ type: 'session.commentary.appended' }, (appended) => {
      runAppended(options, session, appended.client_event_id, appended.start_ms);
    })
    .with({ type: 'session.closed' }, () => {
      if (!session.isClosing) {
        raiseSpeechEvent(session, { kind: 'dropped' });
      }

      endGPTLiveSession(session);
    })
    .with({ type: 'error' }, (failure) => {
      runProviderError(options, session, failure.error);
    })
    .exhaustive();
}

interface Slice {
  readonly text: string;
  readonly startMs: number;
  readonly endMs: number;
}

function runInputSlice(options: GPTLiveOptions, session: GPTLiveSession, slice: Slice): void {
  session.requestSlices.push(slice);
  session.heardSlices.push(slice);

  startCut(options, session, slice.startMs);

  startQuietTimer(options.clock, session.inputQuiet, quietMs, () => {
    flushHeardSlices(session, Number.POSITIVE_INFINITY);
  });
}

function runOutputSlice(options: GPTLiveOptions, session: GPTLiveSession, slice: Slice): void {
  session.lastOutputAtMs = options.clock.now();

  const line = session.lines.findLast(
    (candidate) =>
      candidate.isPlaying &&
      !candidate.isCut &&
      candidate.startMs !== null &&
      slice.startMs >= candidate.startMs,
  );

  if (line === undefined) {
    session.talkSlices.push(slice);
  } else {
    line.spoken.push(slice);
  }

  startOutputQuietTimer(options, session);
}

// A line is over once the speech layer has said nothing for a while.
function startOutputQuietTimer(options: GPTLiveOptions, session: GPTLiveSession): void {
  startQuietTimer(options.clock, session.outputQuiet, quietMs, () => {
    for (const line of session.lines) {
      line.isPlaying = false;
    }

    flushTalkSlices(session);
  });
}

function runDelegation(session: GPTLiveSession, delegationID: string, offsetMs: number): void {
  flushTalkSlices(session);
  flushHeardSlices(session, offsetMs);

  const request = joinSlices(session.requestSlices.filter((slice) => slice.startMs <= offsetMs));

  session.requestSlices = session.requestSlices.filter((slice) => slice.startMs > offsetMs);

  // An empty thinking part, sent at once, keeps the speech layer silent while nixie's turn runs: it
  // makes up no result and promises nothing, as the empty commentary part does.
  sendGPTLiveEvent(session, {
    type: 'session.thinking.append',
    event_id: `thinking_${String(session.nextEventNumber)}`,
    delegation_id: delegationID,
    content: '',
  });

  session.nextEventNumber += 1;

  raiseSpeechEvent(session, { kind: 'hand_off', handOffID: delegationID, request });
}

function runAppended(
  options: GPTLiveOptions,
  session: GPTLiveSession,
  clientEventID: string | undefined,
  startMs: number,
): void {
  if (clientEventID !== undefined) {
    session.pendingEventIDs.delete(clientEventID);
  }

  const line = session.lines.find((candidate) => isLineEvent(candidate, clientEventID));

  if (line === undefined) {
    return;
  }

  if (line.startMs === null) {
    line.startMs = startMs;
  }

  // each part starts the line playing again, after a gap between the parts
  line.isPlaying = true;

  startOutputQuietTimer(options, session);
}

function isLineEvent(line: SpokenLine, clientEventID: string | null | undefined): boolean {
  return (
    clientEventID !== undefined &&
    clientEventID !== null &&
    (clientEventID === line.eventID || clientEventID.startsWith(`${line.eventID}.`))
  );
}

interface ProviderError {
  readonly type?: string | undefined;
  readonly message?: string | undefined;
  readonly param?: string | null | undefined;
  readonly client_event_id?: string | null | undefined;
}

function runProviderError(
  options: GPTLiveOptions,
  session: GPTLiveSession,
  error: ProviderError,
): void {
  const clientEventID = error.client_event_id ?? undefined;
  const line = session.lines.find((candidate) => isLineEvent(candidate, clientEventID));

  // a commentary that the provider refused is never spoken, and a close no longer waits on it
  if (clientEventID !== undefined) {
    session.pendingEventIDs.delete(clientEventID);
  }

  if (line !== undefined && line.startMs === null) {
    session.lines = session.lines.filter((candidate) => candidate !== line);
  }

  options.logEvent(
    'calls.speech_provider_error',
    {
      sessionID: session.sessionID,
      type: error.type ?? null,
      param: error.param ?? null,
      message: error.message ?? null,
    },
    'warn',
  );
}
