import type { BoundSession, SessionEvent, SessionState } from '@heynixie/coding';
import type { Logger } from '@heynixie/logger';
import { atcSchemas } from '../atc-schemas';
import type { CallATC } from '../call/make-atc-caller';
import { mapATCState } from '../session/map-atc-state';
import { buildSessionEvents } from './build-session-events';

// What the adapter last mapped for a session, and when it read it.
export interface KnownSession {
  state: SessionState;
  readAtMs: number;
}

export interface EventsDependencies {
  readonly call: CallATC;
  readonly known: Map<string, KnownSession>;
  readonly log: Logger;
  readonly now: () => number;

  // how long a read waits for a new event
  readonly waitMs: number;

  // how often a session that has not ended gets a state read
  readonly stateReadMs: number;
}

export interface EventsPage {
  readonly cursor: string;
  readonly events: readonly SessionEvent[];
}

// Reads atc's trail from the cursor, a page at a time, with no session filter. A page after one
// with events comes at once, empty when the read caught up; any other page waits for an event. A
// page with more after it and no events goes unyielded. A bound session gets a state read.
export async function* readATCEvents(
  deps: EventsDependencies,
  cursor: string | null,
  signal: AbortSignal,
  readBound: () => Promise<readonly BoundSession[]>,
): AsyncGenerator<EventsPage> {
  let current = cursor;
  let isDue = true;

  while (!signal.aborted) {
    const bound = current === null ? [] : await readBound();

    registerBound(deps, bound);

    const boundIDs = new Set(bound.map((session) => session.id));

    const waitMs = isDue
      ? 0
      : Math.ceil(Math.min(deps.waitMs, getMsToNextStateRead(deps, boundIDs)));

    const args = current === null ? { limit: 1 } : { cursor: current, limit: 200, waitMs };

    const outcome = await deps.call('atc_events_read', args, signal);

    if (outcome.status !== 'ok') {
      throw new Error(`the atc event read gave ${describeOutcome(outcome)}`);
    }

    const page = atcSchemas.eventsPage.parse(outcome.data);

    for (const daemon of page.truncated ?? []) {
      deps.log('coding.atc_trail_truncated', { daemon }, 'warn');
    }

    if (current === null) {
      current = page.cursor;
      yield { cursor: page.cursor, events: [] };
      continue;
    }

    const events = [
      ...buildSessionEvents(page.events),
      ...(await readStateEvents(deps, collectStateReads(deps, page.events, boundIDs), signal)),
    ];

    current = page.cursor;

    if (page.more && events.length === 0) {
      isDue = true;
      continue;
    }

    isDue = page.more || events.length > 0;
    yield { cursor: page.cursor, events };
  }
}

// A bound session that the adapter has not seen yet is read at once: its state may have changed
// while nixie was down.
function registerBound(deps: EventsDependencies, bound: readonly BoundSession[]): void {
  for (const session of bound) {
    if (!deps.known.has(session.id)) {
      deps.known.set(session.id, { state: session.state, readAtMs: 0 });
    }
  }
}

function getMsToNextStateRead(deps: EventsDependencies, boundIDs: ReadonlySet<string>): number {
  const nowMs = deps.now();

  const dueIn = [...deps.known]
    .filter(([id, known]) => boundIDs.has(id) && known.state !== 'ended')
    .map(([, known]) => known.readAtMs + deps.stateReadMs - nowMs);

  return Math.max(0, Math.min(Number.POSITIVE_INFINITY, ...dueIn));
}

function describeOutcome(outcome: Awaited<ReturnType<CallATC>>): string {
  return outcome.status === 'failed' ? outcome.code : outcome.status;
}

async function readStateEvents(
  deps: EventsDependencies,
  sessions: readonly string[],
  signal: AbortSignal,
): Promise<SessionEvent[]> {
  const events: SessionEvent[] = [];

  for (const id of sessions) {
    const event = await readStateEvent(deps, id, signal);

    if (event !== null) {
      events.push(event);
    }
  }

  return events;
}

async function readStateEvent(
  deps: EventsDependencies,
  id: string,
  signal: AbortSignal,
): Promise<SessionEvent | null> {
  const outcome = await deps.call('atc_session_get', { session: id }, signal);

  const nowMs = deps.now();
  const read = pickStateRead(deps, outcome);
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

function pickStateRead(
  deps: EventsDependencies,
  outcome: Awaited<ReturnType<CallATC>>,
): { readonly state: SessionState; readonly question: string | null } | null {
  if (outcome.status === 'failed' && outcome.code === 'no_such_session') {
    return { state: 'gone', question: null };
  }

  if (outcome.status !== 'ok') {
    return null;
  }

  const parsed = atcSchemas.sessionGet.safeParse(outcome.data);

  if (!parsed.success) {
    return null;
  }

  const state = mapATCState(parsed.data.session.state, parsed.data.session.lifecycle?.harness);

  if (state === null) {
    deps.log('coding.atc_unknown_state', { value: parsed.data.session.state }, 'warn');

    return null;
  }

  return { state, question: parsed.data.pending?.message ?? null };
}

function collectStateReads(
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
