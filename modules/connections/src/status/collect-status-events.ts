import { collectRemovedToolNames } from './collect-removed-tool-names';
import { isBreakEnd } from './is-break-end';
import { pickBreakStartMs } from './pick-break-start-ms';
import type {
  ConnectionFacts,
  ConnectionIdentity,
  FailingReason,
  StatusEvent,
  StatusEventRange,
} from './types';

// One step of a connection's status, as a record of the log tells it.
export interface StatusStep {
  readonly sequence: number;
  readonly atMs: number;

  // the connection's ID, which the records name it by
  readonly connection: string;
  readonly step:
    | {
        readonly kind: 'active';

        // a renewal that found the connection in a status the model hears of
        readonly wasAttending?: boolean;

        // for a renewal of a grant that had ended, when it ended
        readonly endedAtMs?: number;
      }
    | { readonly kind: 'needs_consent' }
    | {
        readonly kind: 'expiring';

        // a renewal into a grant within its window, and when the grant it renewed had ended
        readonly renewed?: boolean;
        readonly endedAtMs?: number;
      }
    | { readonly kind: 'failing'; readonly reason: FailingReason | null }
    | { readonly kind: 'lasted'; readonly sinceMs: number };
}

// A call that failed, or a job run that started, while a connection was broken, at the time the call
// began or the run started.
export interface BreakNote {
  readonly atMs: number;
  readonly connection: string;
}

interface StatusFacts {
  // every step, oldest first
  readonly steps: readonly StatusStep[];
  readonly failedCalls: readonly BreakNote[];
  readonly skippedRuns: readonly BreakNote[];

  // the connections that live, by ID; a connection with no entry has no event
  readonly facts: ReadonlyMap<string, ConnectionFacts>;
}

// The events of the range: each change into a status the model hears of, never into the one it
// holds, each return to `active` from one, and each break that passed the notice time. A return
// counts the calls that failed and the job runs that ran without the connection in its break.
export function collectStatusEvents(facts: StatusFacts, range: StatusEventRange): StatusEvent[] {
  const away = new Set<string>();
  const held = new Map<string, string>();

  const events: StatusEvent[] = [];

  for (const step of facts.steps) {
    const found = facts.facts.get(step.connection);
    const who = found === undefined ? undefined : toIdentity(found);
    const base = { sequence: step.sequence, atMs: step.atMs };
    const change = step.step;
    const isInRange = step.sequence > range.after && step.sequence <= range.through;

    if (change.kind === 'active') {
      held.delete(step.connection);

      const wasAway = away.delete(step.connection) || change.wasAttending === true;

      if (isInRange && who !== undefined && wasAway) {
        const noted = pickBreakBounds(facts.steps, step);

        events.push({
          ...base,
          who,
          kind: 'returned',
          failedCalls: countNotes(facts.failedCalls, step.connection, noted),
          skippedRuns: countNotes(facts.skippedRuns, step.connection, noted),
        });
      }

      continue;
    }

    const heldBefore =
      change.kind === 'expiring' && change.endedAtMs !== undefined
        ? 'needs_consent'
        : held.get(step.connection);

    const heldNow = change.kind === 'failing' ? `failing:${String(change.reason)}` : change.kind;

    if (change.kind !== 'lasted') {
      away.add(step.connection);
      held.set(step.connection, heldNow);
    }

    if (!isInRange || who === undefined || heldBefore === heldNow) {
      continue;
    }

    if (change.kind === 'lasted') {
      events.push({ ...base, who, kind: 'lasted', sinceMs: change.sinceMs });
    } else {
      events.push({
        ...base,
        who,
        kind: 'changed',
        status: change.kind,
        reason: change.kind === 'failing' ? change.reason : null,
        lastSuccessAtMs: found?.lastSuccessAtMs ?? null,
        removedTools: collectRemovedToolNames(change.kind, found?.toolNames ?? []),
      });
    }
  }

  return events;
}

function toIdentity(found: ConnectionFacts): ConnectionIdentity {
  return {
    connection: found.connection,
    connector: found.connector,
    label: found.label,
    account: found.account,
  };
}

interface BreakBounds {
  // when the break began, or null when the connection only expired
  readonly startMs: number | null;

  // when the connection returned
  readonly endMs: number;
}

// The break a return ends: from its first failing or consent step since the last return, or from the
// end of the grant it renewed when that comes first, so an end that no step recorded still starts a
// break, to the return. A call or a job run counts by the time it happened.
function pickBreakBounds(steps: readonly StatusStep[], returned: StatusStep): BreakBounds {
  const earlier = steps.filter(
    (step) => step.connection === returned.connection && step.sequence < returned.sequence,
  );

  const lastEnd = earlier.findLastIndex((step) => isBreakEnd(step));
  const recordedMs = pickBreakStartMs(earlier.slice(lastEnd + 1));
  const endedAtMs = returned.step.kind === 'active' ? returned.step.endedAtMs : undefined;
  const starts = [recordedMs, endedAtMs].filter((startMs) => typeof startMs === 'number');

  return { startMs: starts.length === 0 ? null : Math.min(...starts), endMs: returned.atMs };
}

function countNotes(notes: readonly BreakNote[], connection: string, bounds: BreakBounds): number {
  const startMs = bounds.startMs;

  return startMs === null
    ? 0
    : notes.filter(
        (note) =>
          note.connection === connection && note.atMs >= startMs && note.atMs <= bounds.endMs,
      ).length;
}
