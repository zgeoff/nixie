import type {
  AdapterReply,
  CodingAdapter,
  ReachableSession,
  SessionRead,
  SessionRef,
  SessionState,
  StartCursorStore,
  TargetRef,
} from '@heynixie/coding';
import type { Logger } from '@heynixie/logger';
import type { ATCConnection } from './call/connect-atc';
import { connectATC } from './call/connect-atc';
import { runATCCall } from './call/run-atc-call';
import type { KnownSession } from './events/read-atc-events';
import { readATCEvents } from './events/read-atc-events';
import { buildSpawnArguments } from './session/build-spawn-arguments';
import { mapATCState } from './session/map-atc-state';
import { readTranscriptTail } from './session/read-transcript-tail';
import type { SessionEntry } from './types';

export interface ATCAdapterOptions extends ATCConnection {
  // the targets nixie lists, joins and starts on
  readonly targets: readonly TargetRef[];
  readonly log: Logger;

  // keeps the cursor of each start across a restart
  readonly cursors: StartCursorStore;

  // milliseconds since the epoch
  readonly now?: () => number;
  readonly waitMs?: number;
  readonly stateReadMs?: number;
}

// atc refuses a note with `unsupported` while the session's message bridge attaches, in the
// session's first minute.
const earlyNoteMs = 60_000;

// The coding adapter of atc, through atc-gateway's typed fleet API as the service client the token
// names.
export function buildATCAdapter(options: ATCAdapterOptions): CodingAdapter {
  const atc = connectATC(options);
  const now = options.now ?? Date.now;

  const known = new Map<string, KnownSession>();

  const readCursor = async (): Promise<AdapterReply<string>> => {
    const page = await runATCCall(() => atc.events.read({ limit: 1 }), {
      procedure: 'events.read',
      isKeyed: false,
    });

    return page.status === 'ok' ? { status: 'ok', value: page.value.cursor } : page;
  };

  const isConfiguredTarget = (entry: SessionEntry): boolean =>
    options.targets.some(
      (target) =>
        target.daemon === entry.locator.daemon && target.target === entry.locator.targetID,
    );

  const mapState = (id: string, entry: SessionEntry): SessionState => {
    const state = mapATCState(entry.state, entry.lifecycle.harness);

    if (state === null) {
      options.log('coding.atc_unknown_state', { value: entry.state }, 'warn');
    }

    return state ?? known.get(id)?.state ?? 'running';
  };

  // A replay that read the cursor again would skip the events since the first spawn, so the cursor
  // is stored before the spawn leaves. A cursor that cannot be read or stored may hide a spawn that
  // ran, so it gives the unknown outcome, which keeps the key.
  const readStartCursor = async (idempotencyKey: string): Promise<AdapterReply<string>> => {
    try {
      const kept = await options.cursors.read(idempotencyKey);

      if (kept !== null) {
        return { status: 'ok', value: kept };
      }

      const cursor = await readCursor();

      if (cursor.status !== 'ok') {
        return cursor.status === 'refused' && cursor.canClear
          ? { status: 'unknown', reason: cursor.reason }
          : cursor;
      }

      await options.cursors.write(idempotencyKey, cursor.value);

      return cursor;
    } catch (error) {
      options.log('coding.atc_cursor_store_failed', { error: String(error) }, 'error');

      return { status: 'unknown', reason: 'cursor_store_failed' };
    }
  };

  // A refused spawn spends its key, so the next attempt reads a cursor of its own.
  const removeStartCursor = async (idempotencyKey: string): Promise<void> => {
    try {
      await options.cursors.remove(idempotencyKey);
    } catch (error) {
      options.log('coding.atc_cursor_store_failed', { error: String(error) }, 'error');
    }
  };

  const readSession = async (session: SessionRef) => {
    const read = await runATCCall(() => atc.session.get({ session: session.id }), {
      procedure: 'session.get',
      isKeyed: false,
    });

    return read.status === 'ok'
      ? ({
          status: 'ok',
          value: { ...read.value, state: mapState(session.id, read.value.session) },
        } as const)
      : read;
  };

  const readSessionAgeMs = async (session: SessionRef): Promise<number | null> => {
    const read = await runATCCall(() => atc.session.get({ session: session.id }), {
      procedure: 'session.get',
      isKeyed: false,
    });

    return read.status === 'ok' ? now() - read.value.session.createdAt : null;
  };

  return {
    id: 'atc',
    start: async (brief, idempotencyKey) => {
      const cursor = await readStartCursor(idempotencyKey);

      if (cursor.status !== 'ok') {
        return cursor;
      }

      const spawned = await runATCCall(
        () => atc.session.spawn(buildSpawnArguments(brief, idempotencyKey)),
        { procedure: 'session.spawn', isKeyed: true },
      );

      if (spawned.status === 'refused') {
        await removeStartCursor(idempotencyKey);
      }

      if (spawned.status !== 'ok') {
        return spawned;
      }

      const entry = spawned.value.session;
      const state = mapState(entry.id, entry);

      known.set(entry.id, { state, readAtMs: now() });

      return {
        status: 'ok',
        value: { session: { id: entry.id }, state, fromCursor: cursor.value },
      };
    },
    join: async (session) => {
      const read = await readSession(session);

      if (read.status !== 'ok') {
        return read;
      }

      if (!isConfiguredTarget(read.value.session)) {
        return { status: 'refused', canClear: false, reason: 'no_such_session' };
      }

      const cursor = await readCursor();

      if (cursor.status !== 'ok') {
        return cursor;
      }

      known.set(session.id, { state: read.value.state, readAtMs: now() });

      return {
        status: 'ok',
        value: { session, state: read.value.state, fromCursor: cursor.value },
      };
    },
    list: async () => {
      const listed = await runATCCall(() => atc.session.list({}), {
        procedure: 'session.list',
        isKeyed: false,
      });

      if (listed.status !== 'ok') {
        return listed;
      }

      const notUp = listed.value.daemons.filter(
        (daemon) =>
          daemon.state !== 'up' && options.targets.some((target) => target.daemon === daemon.name),
      );

      for (const daemon of notUp) {
        options.log(
          'coding.atc_daemon_not_up',
          { daemon: daemon.name, state: daemon.state },
          'warn',
        );
      }

      const sessions = listed.value.sessions.flatMap((entry): ReachableSession[] =>
        isConfiguredTarget(entry)
          ? [
              {
                session: { id: entry.id },
                target: { daemon: entry.locator.daemon, target: entry.locator.targetID },
                name: entry.name,
                cwd: entry.cwd,
                state: mapState(entry.id, entry),
              },
            ]
          : [],
      );

      const [first] = notUp;

      // A list that is empty because its daemon cannot be reached is a refusal, never an empty list.
      return sessions.length === 0 && first !== undefined
        ? { status: 'refused', canClear: first.state === 'down', reason: `daemon_${first.state}` }
        : { status: 'ok', value: sessions };
    },
    read: async (session, readOptions) => {
      const read = await readSession(session);

      if (read.status !== 'ok') {
        return read;
      }

      const tail = await readTranscriptTail(atc, session.id, readOptions.tailTurns);

      if (tail.status !== 'ok') {
        return tail;
      }

      const value: SessionRead = {
        state: read.value.state,
        question: read.value.state === 'waiting' ? (read.value.pending?.message ?? null) : null,
        lastReply: read.value.result ?? null,
        prompt: readOptions.prompt ? (read.value.prompt ?? null) : null,
        tail: tail.value,
      };

      return { status: 'ok', value };
    },
    steer: async (session, text) => {
      const read = await readSession(session);

      if (read.status !== 'ok') {
        return read;
      }

      if (read.value.state === 'waiting') {
        return { status: 'refused', canClear: false, reason: 'menu_open' };
      }

      const typed = await runATCCall(() => atc.session.submit({ session: session.id, text }), {
        procedure: 'session.submit',
        isKeyed: false,
      });

      return typed.status === 'ok' ? { status: 'ok', value: { typed: true } } : typed;
    },
    message: async (session, text, idempotencyKey) => {
      const sent = await runATCCall(
        () => atc.session.message({ session: session.id, text, idempotencyKey }),
        { procedure: 'session.message', isKeyed: true },
      );

      if (sent.status === 'ok') {
        return { status: 'ok', value: { messageRef: sent.value.message } };
      }

      if (sent.status === 'refused' && sent.reason === 'unsupported') {
        const ageMs = await readSessionAgeMs(session);

        return ageMs !== null && ageMs < earlyNoteMs ? { ...sent, canClear: true } : sent;
      }

      return sent;
    },
    stop: async (session) => {
      const stopped = await runATCCall(() => atc.session.kill({ session: session.id }), {
        procedure: 'session.kill',
        isKeyed: false,
      });

      return stopped.status === 'ok'
        ? { status: 'ok', value: { stopped: stopped.value.stopped === true } }
        : stopped;
    },
    events: (cursor, signal, readBound) =>
      readATCEvents(
        {
          atc,
          known,
          log: options.log,
          now,
          waitMs: options.waitMs ?? 25_000,
          stateReadMs: options.stateReadMs ?? 60_000,
        },
        cursor,
        signal,
        readBound,
      ),
  };
}
