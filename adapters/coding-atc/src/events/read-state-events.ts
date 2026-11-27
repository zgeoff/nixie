import type { BoundSession, SessionEvent, SessionState } from '@heynixie/coding';
import { runATCCall } from '../call/run-atc-call';
import { mapATCState } from '../session/map-atc-state';
import type { EventsDependencies } from './types';

// A bound session that the adapter has not seen yet is read at once: its state may have changed
// while nixie was down.
export function registerBound(deps: EventsDependencies, bound: readonly BoundSession[]): void {
  for (const session of bound) {
    if (!deps.known.has(session.id)) {
      deps.known.set(session.id, { state: session.state, readAtMs: 0 });
    }
  }
}

// How long until the next bound session is due a state read, at most `waitMs`.
export function getMsToNextStateRead(
  deps: EventsDependencies,
  boundIDs: ReadonlySet<string>,
): number {
  const nowMs = deps.now();

  const dueIn = [...deps.known]
    .filter(([id, known]) => boundIDs.has(id) && known.state !== 'ended')
    .map(([, known]) => known.readAtMs + deps.stateReadMs - nowMs);

  return Math.ceil(Math.max(0, Math.min(deps.waitMs, ...dueIn)));
}

// The bound sessions that the trail names, and those whose state read is due.
export function collectStateReads(
  deps: EventsDependencies,
  trail: readonly { readonly session: string }[],
  boundIDs: ReadonlySet<string>,
): string[] {
  const nowMs = deps.now();

  const due = [...deps.known]
    .filter(
      ([id, known]) =>
        boundIDs.has(id) && known.state !== 'ended' && nowMs - known.readAtMs >= deps.stateReadMs,
    )
    .map(([id]) => id);

  return [
    ...new Set([...trail.map((event) => event.session).filter((id) => boundIDs.has(id)), ...due]),
  ];
}

export async function readStateEvents(
  deps: EventsDependencies,
  sessions: readonly string[],
): Promise<SessionEvent[]> {
  const events: SessionEvent[] = [];

  for (const id of sessions) {
    const event = await readStateEvent(deps, id);

    if (event !== null) {
      events.push(event);
    }
  }

  return events;
}

async function readStateEvent(deps: EventsDependencies, id: string): Promise<SessionEvent | null> {
  const read = await readState(deps, id);

  const nowMs = deps.now();
  const known = deps.known.get(id);

  if (read === null) {
    if (known !== undefined) {
      deps.known.set(id, { ...known, readAtMs: nowMs });
    }

    return null;
  }

  deps.known.set(id, { state: read.state, readAtMs: nowMs });

  if (known?.state === read.state) {
    return null;
  }

  const at = new Date(nowMs).toISOString();

  return {
    kind: 'state',
    state: read.state,
    question: read.question,
    session: id,
    eventKey: `${id}|state|${read.state}|${at}`,
    at,
  };
}

async function readState(
  deps: EventsDependencies,
  id: string,
): Promise<{ readonly state: SessionState; readonly question: string | null } | null> {
  const read = await runATCCall(() => deps.atc.session.get({ session: id }), {
    procedure: 'session.get',
    isKeyed: false,
  });

  if (read.status === 'refused' && read.reason === 'no_such_session') {
    return { state: 'gone', question: null };
  }

  if (read.status !== 'ok') {
    return null;
  }

  const state = mapATCState(read.value.session.state, read.value.session.lifecycle.harness);

  if (state === null) {
    deps.log('coding.atc_unknown_state', { value: read.value.session.state }, 'warn');

    return null;
  }

  return { state, question: read.value.pending?.message ?? null };
}
