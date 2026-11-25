import type {
  AdapterReply,
  CodingAdapter,
  ReachableSession,
  SessionRead,
  SessionRef,
  SessionState,
  TargetRef,
} from '@heynixie/coding';
import type { Logger } from '@heynixie/logger';
import type { z } from 'zod';
import { atcSchemas } from './atc-schemas';
import type { ATCConnection } from './call/make-atc-caller';
import { makeATCCaller } from './call/make-atc-caller';
import { toReply } from './call/to-reply';
import type { KnownSession } from './events/read-atc-events';
import { readATCEvents } from './events/read-atc-events';
import { buildSpawnArguments } from './session/build-spawn-arguments';
import { mapATCState } from './session/map-atc-state';
import { readTranscriptTail } from './session/read-transcript-tail';

export interface ATCAdapterOptions extends ATCConnection {
  // the targets nixie lists, joins and starts on
  readonly targets: readonly TargetRef[];
  readonly log: Logger;

  // milliseconds since the epoch
  readonly now?: () => number;
  readonly waitMs?: number;
  readonly stateReadMs?: number;
}

// atc refuses a note with `unsupported` while the session's message bridge attaches, in the
// session's first minute.
const earlyNoteMs = 60_000;

// The coding adapter of atc, through atc-gateway's MCP tools as the service client the token names.
export function buildATCAdapter(options: ATCAdapterOptions): CodingAdapter {
  const call = makeATCCaller(options);
  const now = options.now ?? Date.now;

  const known = new Map<string, KnownSession>();

  // the cursor each unfinished start read before its spawn, so a replay of the spawn keeps it
  const startCursors = new Map<string, string>();

  const run = async <Value>(
    tool: string,
    args: Readonly<Record<string, unknown>>,
    schema: z.ZodType<Value>,
    key?: string,
  ): Promise<AdapterReply<Value>> => {
    const outcome = await call(tool, args);

    return toReply(outcome, schema, { tool, isKeyed: key !== undefined });
  };

  const readCursor = async (): Promise<AdapterReply<string>> => {
    const page = await run('atc_events_read', { limit: 1 }, atcSchemas.eventsPage);

    return page.status === 'ok' ? { status: 'ok', value: page.value.cursor } : page;
  };

  const isConfiguredTarget = (entry: z.infer<typeof atcSchemas.sessionEntry>): boolean =>
    options.targets.some(
      (target) =>
        target.daemon === entry.locator.daemon && target.target === entry.locator.targetID,
    );

  const mapState = (id: string, entry: z.infer<typeof atcSchemas.sessionEntry>): SessionState => {
    const state = mapATCState(entry.state, entry.lifecycle?.harness);

    if (state === null) {
      options.log('coding.atc_unknown_state', { value: entry.state }, 'warn');
    }

    return state ?? known.get(id)?.state ?? 'running';
  };

  // A replay that read the cursor again would skip the events since the first spawn. A cursor that
  // cannot be read may hide a spawn that ran, so it gives the unknown outcome, which keeps the key.
  const readStartCursor = async (idempotencyKey: string): Promise<AdapterReply<string>> => {
    const kept = startCursors.get(idempotencyKey);

    if (kept !== undefined) {
      return { status: 'ok', value: kept };
    }

    const cursor = await readCursor();

    if (cursor.status === 'ok') {
      startCursors.set(idempotencyKey, cursor.value);

      return cursor;
    }

    return cursor.status === 'refused' && cursor.canClear
      ? { status: 'unknown', reason: cursor.reason }
      : cursor;
  };

  const readSession = async (session: SessionRef) => {
    const read = await run('atc_session_get', { session: session.id }, atcSchemas.sessionGet);

    return read.status === 'ok'
      ? ({
          status: 'ok',
          value: { ...read.value, state: mapState(session.id, read.value.session) },
        } as const)
      : read;
  };

  const readSessionAgeMs = async (session: SessionRef): Promise<number | null> => {
    const read = await run('atc_session_get', { session: session.id }, atcSchemas.sessionGet);

    return read.status === 'ok' && read.value.session.createdAt !== undefined
      ? now() - read.value.session.createdAt
      : null;
  };

  return {
    id: 'atc',
    start: async (brief, idempotencyKey) => {
      const cursor = await readStartCursor(idempotencyKey);

      if (cursor.status !== 'ok') {
        return cursor;
      }

      const spawned = await run(
        'atc_session_spawn',
        buildSpawnArguments(brief, idempotencyKey),
        atcSchemas.sessionEntry,
        idempotencyKey,
      );

      if (spawned.status !== 'unknown') {
        startCursors.delete(idempotencyKey);
      }

      if (spawned.status !== 'ok') {
        return spawned;
      }

      const state = mapState(spawned.value.id, spawned.value);

      known.set(spawned.value.id, { state, readAtMs: now() });

      return {
        status: 'ok',
        value: { session: { id: spawned.value.id }, state, fromCursor: cursor.value },
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
      const listed = await run('atc_sessions_list', {}, atcSchemas.sessionsList);

      if (listed.status !== 'ok') {
        return listed;
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

      return { status: 'ok', value: sessions };
    },
    read: async (session, readOptions) => {
      const read = await readSession(session);

      if (read.status !== 'ok') {
        return read;
      }

      const tail = await readTranscriptTail(call, session.id, readOptions.tailTurns);

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

      const typed = await run(
        'atc_terminal_type',
        { session: session.id, text },
        atcSchemas.anyAnswer,
      );

      return typed.status === 'ok' ? { status: 'ok', value: { typed: true } } : typed;
    },
    message: async (session, text, idempotencyKey) => {
      const sent = await run(
        'atc_message_send',
        { session: session.id, text, idempotencyKey },
        atcSchemas.messageSent,
        idempotencyKey,
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
      const stopped = await run(
        'atc_session_stop',
        { session: session.id },
        atcSchemas.sessionStop,
      );

      return stopped.status === 'ok'
        ? { status: 'ok', value: { stopped: stopped.value.stopped } }
        : stopped;
    },
    events: (cursor, signal, readBound) =>
      readATCEvents(
        {
          call,
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
