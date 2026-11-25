import type { SpeechEvent, SpeechLayer } from '@heynixie/calls';
import { closeConfirmMs, closeIdleLimitMs, closePollMs } from './constants';
import { openGPTLiveSession } from './open/open-gpt-live-session';
import { endGPTLiveSession } from './session/end-gpt-live-session';
import { sendGPTLiveEvent } from './session/send-gpt-live-event';
import { collectAnswerParts } from './text/collect-answer-parts';
import type { GPTLiveOptions, GPTLiveSession } from './types';

const closedMessage = 'the speech session is closed';

// The speech layer on OpenAI's GPT-Live. The server creates each session from the device's offer
// and joins it on the sideband, and the adapter maps the provider's events onto `SpeechEvent`.
export function buildGPTLiveSpeech(options: GPTLiveOptions): SpeechLayer {
  const sessions = new Map<string, GPTLiveSession>();

  const findOpenSession = (sessionID: string): GPTLiveSession | null => {
    const session = sessions.get(sessionID);

    return session === undefined || session.isClosed ? null : session;
  };

  return {
    model: options.model,
    open: async (input) => {
      const result = await openGPTLiveSession(options, input);

      if (result.kind === 'refused') {
        return result.refusal;
      }

      sessions.set(result.session.sessionID, result.session);

      return result.opened;
    },
    answer: (sessionID, handOffID, text) => {
      const session = findOpenSession(sessionID);

      if (session === null) {
        return Promise.reject(new Error(closedMessage));
      }

      const eventID = `answer_${String(session.nextEventNumber)}`;

      session.nextEventNumber += 1;

      session.lines.push(buildLine('answer', eventID, handOffID, text));

      // `final` marks the end inside nixie: the provider has no close for a delegation
      for (const [index, part] of collectAnswerParts(text).entries()) {
        sendCommentary(session, `${eventID}.${String(index)}`, handOffID, part);
      }

      return Promise.resolve();
    },
    say: (sessionID, text) => {
      const session = findOpenSession(sessionID);

      if (session === null) {
        return Promise.reject(new Error(closedMessage));
      }

      const eventID = `say_${String(session.nextEventNumber)}`;

      session.nextEventNumber += 1;

      session.lines.push(buildLine('say', eventID, null, text));

      sendCommentary(session, `${eventID}.0`, null, text);

      return Promise.resolve();
    },
    close: async (sessionID) => {
      const session = sessions.get(sessionID);

      sessions.delete(sessionID);

      if (session !== undefined) {
        await closeSession(options, session);
      }
    },
    events: (sessionID) => streamEvents(sessions.get(sessionID)),
  };
}

function buildLine(
  kind: 'answer' | 'say',
  eventID: string,
  handOffID: string | null,
  sentText: string,
) {
  return {
    kind,
    eventID,
    handOffID,
    sentText,
    startMs: null,
    isPlaying: false,
    isCut: false,
    spoken: [],
  };
}

// A commentary with no delegation is a line to say now, which the speech layer words as its own.
function sendCommentary(
  session: GPTLiveSession,
  eventID: string,
  delegationID: string | null,
  content: string,
): void {
  session.unacknowledged += 1;

  sendGPTLiveEvent(session, {
    type: 'session.commentary.append',
    event_id: eventID,
    delegation_id: delegationID,
    content,
  });
}

// Ends the session once the speech layer has finished the line it is speaking, so a hang-up never
// cuts off nixie's last line.
async function closeSession(options: GPTLiveOptions, session: GPTLiveSession): Promise<void> {
  session.isClosing = true;

  const deadlineMs = options.clock.now() + closeIdleLimitMs;

  while (!session.isClosed && isSpeaking(session) && options.clock.now() < deadlineMs) {
    await options.clock.sleep(closePollMs, session.stopping.signal);
  }

  if (!session.isClosed) {
    sendGPTLiveEvent(session, { type: 'session.close' });

    // the provider confirms with session.closed, which ends the session
    await options.clock.sleep(closeConfirmMs, session.stopping.signal);
  }

  endGPTLiveSession(session);
}

function isSpeaking(session: GPTLiveSession): boolean {
  return session.unacknowledged > 0 || session.lines.some((line) => line.isPlaying);
}

async function* streamEvents(session: GPTLiveSession | undefined): AsyncGenerator<SpeechEvent> {
  if (session === undefined) {
    return;
  }

  for (;;) {
    const queued = session.queue.shift();

    if (queued !== undefined) {
      yield queued;
      continue;
    }

    if (session.isClosed) {
      return;
    }

    const next = await new Promise<SpeechEvent | null>((resolve) => {
      session.waiters.push(resolve);
    });

    if (next === null) {
      return;
    }

    yield next;
  }
}
