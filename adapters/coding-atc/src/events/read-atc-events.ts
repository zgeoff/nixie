import type { BoundSession, SessionEvent } from '@heynixie/coding';
import { runATCCall } from '../call/run-atc-call';
import type { TrailEvent } from '../types';
import { buildSessionEvents } from './build-session-events';
import { readEventTexts } from './read-event-texts';
import {
  collectStateReads,
  getMsToNextStateRead,
  readStateEvents,
  registerBound,
} from './read-state-events';
import type { EventsDependencies } from './types';

export type { EventsDependencies, KnownSession } from './types';

export interface EventsPage {
  readonly cursor: string;
  readonly events: readonly SessionEvent[];
}

// Reads atc's trail from the cursor with no session filter: the backlog a page at a time, then
// atc's event stream. A page with events, or the page that caught up, is yielded. A bound session
// gets a state read when the trail names it, and now and then.
export async function* readATCEvents(
  deps: EventsDependencies,
  cursor: string | null,
  signal: AbortSignal,
  readBound: () => Promise<readonly BoundSession[]>,
): AsyncGenerator<EventsPage> {
  let current: string;

  if (cursor === null) {
    const first = await readOrThrow(() => deps.atc.events.read({ limit: 1 }, { signal }));

    current = first.cursor;
    yield { cursor: current, events: [] };
  } else {
    current = cursor;
  }

  while (!signal.aborted) {
    current = yield* readBacklog(deps, { cursor: current, signal, readBound });

    if (signal.aborted) {
      return;
    }

    yield* readStream(deps, { cursor: current, signal, readBound });
  }
}

// A read that fails throws, with the reason atc gave in the message, so the source logs it and
// reports its health.
async function readOrThrow<Value>(read: () => Promise<Value>): Promise<Value> {
  const reply = await runATCCall(read, { procedure: 'events.read', isKeyed: false });

  if (reply.status !== 'ok') {
    throw new Error(`the atc event read gave ${reply.reason}`);
  }

  return reply.value;
}

interface ReadRun {
  readonly cursor: string;
  readonly signal: AbortSignal;
  readonly readBound: () => Promise<readonly BoundSession[]>;
}

const backlogLimit = 200;

// Reads pages until one has no event and nothing after it. A page with more after it and no events
// goes unyielded. Gives the cursor it reached.
async function* readBacklog(
  deps: EventsDependencies,
  run: ReadRun,
): AsyncGenerator<EventsPage, string> {
  let current = run.cursor;

  while (!run.signal.aborted) {
    const cursor = current;

    const bound = await run.readBound();

    registerBound(deps, bound);

    const boundIDs = new Set(bound.map((session) => session.id));

    const page = await readOrThrow(() =>
      deps.atc.events.read({ cursor, limit: backlogLimit }, { signal: run.signal }),
    );

    for (const daemon of page.truncated) {
      deps.log('coding.atc_trail_truncated', { daemon }, 'warn');
    }

    const events = await readPageEvents(deps, page.events, boundIDs);

    current = page.cursor;

    if (page.more && events.length === 0) {
      continue;
    }

    yield { cursor: page.cursor, events };

    if (!page.more && events.length === 0) {
      return current;
    }
  }

  return current;
}

async function readPageEvents(
  deps: EventsDependencies,
  trail: readonly TrailEvent[],
  boundIDs: ReadonlySet<string>,
): Promise<SessionEvent[]> {
  const texts = await readEventTexts(deps.atc, trail);
  const stateEvents = await readStateEvents(deps, collectStateReads(deps, trail, boundIDs));

  return [...buildSessionEvents(trail, texts), ...stateEvents];
}

// Holds the event stream open from the cursor. It yields a page for each event that gives a session
// event, and an empty page when a state read comes due and the cursor moved. It returns when the
// abort signal fires, and throws when the stream ends otherwise, so the caller backs off.
async function* readStream(deps: EventsDependencies, run: ReadRun): AsyncGenerator<EventsPage> {
  const stream = await deps.atc.events.stream({ cursor: run.cursor }, { signal: run.signal });

  const iterator = stream[Symbol.asyncIterator]();
  let current = run.cursor;
  let yielded = run.cursor;
  let next = settleNext(iterator);

  try {
    while (!run.signal.aborted) {
      const bound = await run.readBound();

      registerBound(deps, bound);

      const boundIDs = new Set(bound.map((session) => session.id));

      const arrival = await waitForArrival(next, getMsToNextStateRead(deps, boundIDs));

      if (run.signal.aborted) {
        return;
      }

      if (arrival.kind === 'failed') {
        throw arrival.error;
      }

      if (arrival.kind === 'ended') {
        throw new Error('the atc event stream ended');
      }

      if (arrival.kind === 'due') {
        const events = await readStateEvents(deps, collectStateReads(deps, [], boundIDs));

        if (events.length > 0 || current !== yielded) {
          yielded = current;
          yield { cursor: current, events };
        }

        continue;
      }

      next = settleNext(iterator);

      if (arrival.item.kind === 'daemons') {
        for (const daemon of arrival.item.truncated) {
          deps.log('coding.atc_trail_truncated', { daemon }, 'warn');
        }

        continue;
      }

      current = arrival.item.event.cursor;

      const events = await readPageEvents(deps, [arrival.item.event], boundIDs);

      if (events.length > 0) {
        yielded = current;
        yield { cursor: current, events };
      }
    }
  } finally {
    await closeIterator(iterator);
  }
}

type StreamItem =
  Awaited<ReturnType<EventsDependencies['atc']['events']['stream']>> extends AsyncIterable<
    infer Item
  >
    ? Item
    : never;

type Arrival =
  | { readonly kind: 'due' }
  | { readonly kind: 'item'; readonly item: StreamItem }
  | { readonly kind: 'failed'; readonly error: unknown }
  | { readonly kind: 'ended' };

// An iterator's next step as a value, so a step that nobody awaits never rejects unhandled.
async function settleNext(iterator: AsyncIterator<StreamItem>): Promise<Arrival> {
  try {
    const step = await iterator.next();

    return step.done === true ? { kind: 'ended' } : { kind: 'item', item: step.value };
  } catch (error) {
    return { kind: 'failed', error };
  }
}

async function waitForArrival(next: Promise<Arrival>, dueInMs: number): Promise<Arrival> {
  const timer = startTimer(dueInMs);

  try {
    return await Promise.race([next, timer.promise]);
  } finally {
    timer.cancel();
  }
}

interface Timer {
  readonly promise: Promise<Arrival>;
  readonly cancel: () => void;
}

function startTimer(timeoutMs: number): Timer {
  let handle: ReturnType<typeof setTimeout> | undefined;

  const promise = new Promise<Arrival>((resolve) => {
    handle = setTimeout(() => {
      resolve({ kind: 'due' });
    }, timeoutMs);
  });

  return {
    promise,
    cancel: () => {
      clearTimeout(handle);
    },
  };
}

async function closeIterator(iterator: AsyncIterator<StreamItem>): Promise<void> {
  try {
    await iterator.return?.();
  } catch {
    // the stream is closed already
  }
}
