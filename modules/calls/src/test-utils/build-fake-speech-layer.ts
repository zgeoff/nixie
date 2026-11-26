import type { OpenSpeech, SpeechEvent, SpeechLayer, SpeechRefused } from '../types';

export type FakeSpeechCall =
  | {
      readonly method: 'open';
      readonly input: OpenSpeech;

      // null for an open that the layer refused
      readonly sessionID: string | null;
    }
  | {
      readonly method: 'answer';
      readonly sessionID: string;
      readonly handOffID: string;
      readonly text: string;
      readonly final: boolean;
    }
  | { readonly method: 'say'; readonly sessionID: string; readonly text: string }
  | { readonly method: 'close'; readonly sessionID: string };

export interface FakeSpeechLayer extends SpeechLayer {
  // every open (a refused one too), answer, say and close, in order
  readonly calls: readonly FakeSpeechCall[];

  // Delivers an event to the session's `events` stream, as the provider would.
  readonly emit: (sessionID: string, event: SpeechEvent) => void;

  // makes the next open answer with the refusal
  readonly refuseNextOpen: (error: SpeechRefused['error']) => void;
}

interface Session {
  readonly queue: SpeechEvent[];
  readonly waiters: ((event: SpeechEvent | null) => void)[];
  isClosed: boolean;
}

// An in-memory speech layer for tests. Each open creates a session, and each session's events
// come from `emit`, until its close ends the stream.
export function buildFakeSpeechLayer(): FakeSpeechLayer {
  const calls: FakeSpeechCall[] = [];

  const sessions = new Map<string, Session>();

  const refusals: SpeechRefused['error'][] = [];

  return {
    model: 'fake-speech-1',
    calls,
    emit: (sessionID, event) => {
      const session = sessions.get(sessionID);

      if (session === undefined || session.isClosed) {
        return;
      }

      const waiter = session.waiters.shift();

      if (waiter === undefined) {
        session.queue.push(event);
      } else {
        waiter(event);
      }
    },
    refuseNextOpen: (error) => {
      refusals.push(error);
    },
    open: (input) => {
      const error = refusals.shift();

      if (error !== undefined) {
        calls.push({ method: 'open', input, sessionID: null });

        return Promise.resolve({ error });
      }

      const sessionID = `fake-session-${sessions.size + 1}`;

      sessions.set(sessionID, { queue: [], waiters: [], isClosed: false });
      calls.push({ method: 'open', input, sessionID });

      return Promise.resolve({
        sdpAnswer: input.sdpOffer.startsWith('v=0')
          ? toMirroredAnswer(input.sdpOffer)
          : `fake-answer-${sessions.size}`,
        sessionID,
      });
    },
    answer: (sessionID, handOffID, text, final) => {
      calls.push({ method: 'answer', sessionID, handOffID, text, final });

      return Promise.resolve();
    },
    say: (sessionID, text) => {
      calls.push({ method: 'say', sessionID, text });

      return Promise.resolve();
    },
    close: (sessionID) => {
      calls.push({ method: 'close', sessionID });

      const session = sessions.get(sessionID);

      if (session !== undefined) {
        session.isClosed = true;

        for (const waiter of session.waiters.splice(0)) {
          waiter(null);
        }
      }

      return Promise.resolve();
    },
    events: (sessionID) => streamEvents(sessions.get(sessionID)),
  };
}

// A browser's offer, answered as the same peer in the active role. A browser applies it without
// error, so a call screen under test can run a real peer connection, which never carries audio.
function toMirroredAnswer(sdpOffer: string): string {
  return sdpOffer.replaceAll('a=setup:actpass', 'a=setup:active');
}

async function* streamEvents(session: Session | undefined): AsyncGenerator<SpeechEvent> {
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
