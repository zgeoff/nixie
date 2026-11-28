import { collectRemovedToolNames } from './collect-removed-tool-names';
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
    | { readonly kind: 'active' }
    | { readonly kind: 'needs_consent' }
    | { readonly kind: 'disconnected' }
    | { readonly kind: 'expiring' }
    | { readonly kind: 'failing'; readonly reason: FailingReason | null }
    | { readonly kind: 'lasted'; readonly sinceMs: number };
}

// A record that a call failed, or a job run started, while a connection was broken.
export interface BreakNote {
  readonly sequence: number;
  readonly connection: string;
}

interface StatusFacts {
  // every step, oldest first, with those after the range too, so a later break bounds an earlier one
  readonly steps: readonly StatusStep[];
  readonly failedCalls: readonly BreakNote[];
  readonly skippedRuns: readonly BreakNote[];

  // the connections that live, by ID; a connection with no entry has no event
  readonly facts: ReadonlyMap<string, ConnectionFacts>;
}

// The events of the range: a line for each change into a status the model hears of, each return to
// `active` from one of them, and each break that passed the notice time. A return counts the calls
// that failed and the job runs that ran without the connection, in its break only.
export function collectStatusEvents(facts: StatusFacts, range: StatusEventRange): StatusEvent[] {
  const away = new Set<string>();

  const events: StatusEvent[] = [];

  for (const step of facts.steps) {
    const found = facts.facts.get(step.connection);
    const who = found === undefined ? undefined : toIdentity(found);
    const base = { sequence: step.sequence, atMs: step.atMs };
    const change = step.step;
    const isInRange = step.sequence > range.after && step.sequence <= range.through;

    if (change.kind === 'active') {
      const wasAway = away.delete(step.connection);

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

    if (change.kind !== 'lasted') {
      away.add(step.connection);
    }

    if (!isInRange || who === undefined) {
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
  // the sequence the break began at, or null when the connection only expired
  readonly after: number | null;

  // the sequence the next break began at
  readonly before: number;
}

// The records that belong to the break a return ends: those after its first failing or consent step
// and before the next break's.
function pickBreakBounds(steps: readonly StatusStep[], returned: StatusStep): BreakBounds {
  const own = steps.filter((step) => step.connection === returned.connection);
  const earlier = own.filter((step) => step.sequence < returned.sequence);
  const lastActive = earlier.findLastIndex((step) => step.step.kind === 'active');
  const first = earlier.slice(lastActive + 1).find((step) => isBreakStep(step));
  const next = own.find((step) => step.sequence > returned.sequence && isBreakStep(step));

  return { after: first?.sequence ?? null, before: next?.sequence ?? Number.MAX_SAFE_INTEGER };
}

function isBreakStep(step: StatusStep): boolean {
  return (
    step.step.kind === 'failing' ||
    step.step.kind === 'needs_consent' ||
    step.step.kind === 'disconnected'
  );
}

function countNotes(notes: readonly BreakNote[], connection: string, bounds: BreakBounds): number {
  const after = bounds.after;

  return after === null
    ? 0
    : notes.filter(
        (note) =>
          note.connection === connection && note.sequence > after && note.sequence < bounds.before,
      ).length;
}
