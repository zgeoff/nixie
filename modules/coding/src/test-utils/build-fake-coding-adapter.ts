import type {
  AdapterReply,
  CodingAdapter,
  ReachableSession,
  SessionEvent,
  SessionRead,
  SessionState,
  StartedSession,
  TargetRef,
  TranscriptTurn,
} from '../types';

export type FakeMethod = 'start' | 'join' | 'list' | 'read' | 'steer' | 'message' | 'stop';

export interface FakeCall {
  readonly method: FakeMethod | 'events';
  readonly session: string | null;
  readonly idempotencyKey: string | null;
  readonly text: string | null;
}

export interface FakeSession {
  readonly id: string;
  readonly name: string;
  readonly target: TargetRef;
  state: SessionState;
  question: string | null;

  // true while the session shows a menu that a typed Enter would pick from
  isMenuOpen: boolean;
  lastReply: string | null;
  prompt: string | null;
  turns: TranscriptTurn[] | 'unsupported';
}

export type FakeSessionSeed = Partial<Omit<FakeSession, 'id'>> & { readonly id: string };

export interface FakeCodingAdapter extends CodingAdapter {
  // each call that reached the fake, in order
  readonly calls: FakeCall[];

  // the IDs that each page of `events` got from its read of the bound sessions, in order
  readonly boundReads: string[][];

  // the sessions the fake holds, by the fake's session ID
  readonly sessions: Map<string, FakeSession>;

  // the next call of the method answers with this reply, once, before the fake's own answer
  readonly replyNext: (method: FakeMethod, reply: AdapterReply<never>) => void;

  // adds a session that runs outside nixie, such as one the user started
  readonly addSession: (session: FakeSessionSeed) => FakeSession;

  // appends events to the trail that `events` reads
  readonly emit: (events: readonly SessionEvent[]) => void;

  // runs while the next start is in its attempt, such as a stop of the task
  readonly runDuringNextStart: (run: () => Promise<void>) => void;
}

// An in-memory coding adapter. A start or a note under a key it has seen returns the first answer
// and does nothing again. A steer to a session that waits on a menu is refused with `menu_open`.
export function buildFakeCodingAdapter(): FakeCodingAdapter {
  const calls: FakeCall[] = [];
  const boundReads: string[][] = [];

  const sessions = new Map<string, FakeSession>();
  const startsByKey = new Map<string, AdapterReply<StartedSession>>();
  const notesByKey = new Map<string, AdapterReply<{ messageRef: string }>>();
  const scripted = new Map<FakeMethod, AdapterReply<never>[]>();

  const trail: SessionEvent[] = [];

  const waiters = new Set<() => void>();

  const duringStart: (() => Promise<void>)[] = [];

  const record = (call: FakeCall) => {
    calls.push(call);
  };

  const takeScripted = (method: FakeMethod): AdapterReply<never> | null =>
    scripted.get(method)?.shift() ?? null;

  const addSession = (seed: FakeSessionSeed): FakeSession => {
    const session: FakeSession = {
      name: seed.id,
      target: { daemon: 'cloud', target: 'cloud' },
      state: 'running',
      question: null,
      isMenuOpen: false,
      lastReply: null,
      prompt: null,
      turns: [],
      ...seed,
    };

    sessions.set(session.id, session);

    return session;
  };

  return {
    id: 'atc',
    calls,
    boundReads,
    sessions,
    replyNext: (method, reply) => {
      scripted.set(method, [...(scripted.get(method) ?? []), reply]);
    },
    addSession,
    emit: (events) => {
      trail.push(...events);

      for (const wake of waiters) {
        wake();
      }
    },
    runDuringNextStart: (run) => {
      duringStart.push(run);
    },
    start: async (brief, idempotencyKey) => {
      record({ method: 'start', session: null, idempotencyKey, text: brief.prompt });

      await duringStart.shift()?.();

      const reply = takeScripted('start') ?? startsByKey.get(idempotencyKey) ?? null;

      if (reply !== null) {
        return reply;
      }

      const session = addSession({
        id: `cloud.3f9a1c2e.${String(sessions.size + 1).padStart(8, '0')}`,
        name: brief.name,
        target: brief.target,
        prompt: brief.prompt,
      });

      const answer: AdapterReply<StartedSession> = {
        status: 'ok',
        value: { session: { id: session.id }, state: 'running', fromCursor: String(trail.length) },
      };

      startsByKey.set(idempotencyKey, answer);

      return answer;
    },
    join: (ref) => {
      record({ method: 'join', session: ref.id, idempotencyKey: null, text: null });

      const session = sessions.get(ref.id);

      return Promise.resolve<AdapterReply<StartedSession>>(
        takeScripted('join') ??
          (session === undefined
            ? { status: 'refused', canClear: false, reason: 'no_such_session' }
            : {
                status: 'ok',
                value: { session: ref, state: session.state, fromCursor: String(trail.length) },
              }),
      );
    },
    list: () => {
      record({ method: 'list', session: null, idempotencyKey: null, text: null });

      return Promise.resolve<AdapterReply<readonly ReachableSession[]>>(
        takeScripted('list') ?? {
          status: 'ok',
          value: [...sessions.values()].map((session) => ({
            session: { id: session.id },
            target: session.target,
            name: session.name,
            cwd: `/work/${session.name}`,
            state: session.state,
          })),
        },
      );
    },
    read: (ref, options) => {
      record({ method: 'read', session: ref.id, idempotencyKey: null, text: null });

      const session = sessions.get(ref.id);
      const scriptedReply = takeScripted('read');

      if (scriptedReply !== null) {
        return Promise.resolve(scriptedReply);
      }

      if (session === undefined) {
        return Promise.resolve({ status: 'refused', canClear: false, reason: 'no_such_session' });
      }

      const read: SessionRead = {
        state: session.state,
        question: session.question,
        lastReply: session.lastReply,
        prompt: options.prompt ? session.prompt : null,
        tail: pickTail(session.turns, options.tailTurns),
      };

      return Promise.resolve({ status: 'ok', value: read });
    },
    steer: (ref, text) => {
      record({ method: 'steer', session: ref.id, idempotencyKey: null, text });

      const scriptedReply = takeScripted('steer');

      if (scriptedReply !== null) {
        return Promise.resolve(scriptedReply);
      }

      const session = sessions.get(ref.id);

      if (session === undefined) {
        return Promise.resolve({ status: 'refused', canClear: false, reason: 'no_such_session' });
      }

      if (session.state === 'waiting' && session.isMenuOpen) {
        return Promise.resolve({ status: 'refused', canClear: false, reason: 'menu_open' });
      }

      return Promise.resolve({ status: 'ok', value: { typed: true } });
    },
    message: (ref, text, idempotencyKey) => {
      record({ method: 'message', session: ref.id, idempotencyKey, text });

      const reply = takeScripted('message') ?? notesByKey.get(idempotencyKey) ?? null;

      if (reply !== null) {
        return Promise.resolve(reply);
      }

      const answer: AdapterReply<{ messageRef: string }> = {
        status: 'ok',
        value: { messageRef: `note-${String(notesByKey.size + 1)}` },
      };

      notesByKey.set(idempotencyKey, answer);

      return Promise.resolve(answer);
    },
    stop: (ref) => {
      record({ method: 'stop', session: ref.id, idempotencyKey: null, text: null });

      const scriptedReply = takeScripted('stop');

      if (scriptedReply !== null) {
        return Promise.resolve(scriptedReply);
      }

      const session = sessions.get(ref.id);

      if (session === undefined) {
        return Promise.resolve({ status: 'refused', canClear: false, reason: 'no_such_session' });
      }

      session.state = 'ended';

      return Promise.resolve({ status: 'ok', value: { stopped: true } });
    },
    events: async function* events(cursor, signal, readBound) {
      record({ method: 'events', session: null, idempotencyKey: null, text: cursor });

      let after = cursor === null ? 0 : Number(cursor);

      // the first page, and the page after each page with events, comes at once, empty when the
      // read caught up; any other page waits for an event
      let isDue = true;

      while (!signal.aborted) {
        const bound = await readBound();

        boundReads.push(bound.map((session) => session.id));

        const page = trail.slice(after);

        if (page.length > 0 || isDue) {
          after = trail.length;
          isDue = page.length > 0;
          yield { cursor: String(after), events: page };
          continue;
        }

        await new Promise<void>((resolve) => {
          const wake = () => {
            waiters.delete(wake);

            resolve();
          };

          waiters.add(wake);
          signal.addEventListener('abort', wake, { once: true });
        });
      }
    },
  };
}

function pickTail(
  turns: FakeSession['turns'],
  count: number,
): readonly TranscriptTurn[] | 'unsupported' {
  if (turns === 'unsupported') {
    return 'unsupported';
  }

  return count === 0 ? [] : turns.slice(-count);
}
