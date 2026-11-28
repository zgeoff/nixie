import type { ConnectionIdentity, FailingReason, StatusEvent, StatusEventRange } from './types';

// One step of a connection's status, as a record of the log tells it.
export interface StatusStep {
  readonly sequence: number;
  readonly atMs: number;

  // the connection's ID, which the records name it by
  readonly connection: string;
  readonly step:
    | { readonly kind: 'active' }
    | { readonly kind: 'needs_consent' }
    | { readonly kind: 'expiring' }
    | { readonly kind: 'failing'; readonly reason: FailingReason | null }
    | { readonly kind: 'lasted'; readonly sinceMs: number };
}

export interface FailedCall {
  readonly sequence: number;
  readonly connection: string;
}

interface StatusFacts {
  // every step through the end of the range, oldest first
  readonly steps: readonly StatusStep[];
  readonly failedCalls: readonly FailedCall[];

  // the connections that live, by ID; a connection with no entry has no event
  readonly identities: ReadonlyMap<string, ConnectionIdentity>;
}

// The events of the range: a line for each change into `needs_consent`, `failing` or `expiring`, each
// return to `active` after a break, and each break that passed the notice time. A return counts the
// calls that failed since its break began.
export function collectStatusEvents(facts: StatusFacts, range: StatusEventRange): StatusEvent[] {
  const breakStarts = new Map<string, number>();

  const events: StatusEvent[] = [];

  for (const step of facts.steps) {
    const who = facts.identities.get(step.connection);
    const breakStart = breakStarts.get(step.connection);
    const base = { sequence: step.sequence, atMs: step.atMs };

    if (step.step.kind === 'failing' || step.step.kind === 'needs_consent') {
      breakStarts.set(step.connection, breakStart ?? step.sequence);
    }

    if (step.step.kind === 'active') {
      breakStarts.delete(step.connection);
    }

    const isInRange = step.sequence > range.after && step.sequence <= range.through;

    if (!isInRange || who === undefined) {
      continue;
    }

    const found = step.step;

    if (found.kind === 'lasted') {
      events.push({ ...base, who, kind: 'lasted', sinceMs: found.sinceMs });
    } else if (found.kind === 'active') {
      if (breakStart !== undefined) {
        events.push({
          ...base,
          who,
          kind: 'returned',
          failedCalls: facts.failedCalls.filter(
            (call) =>
              call.connection === step.connection &&
              call.sequence > breakStart &&
              call.sequence < getNextBreakStart(facts.steps, step),
          ).length,
        });
      }
    } else {
      events.push({
        ...base,
        who,
        kind: 'changed',
        status: found.kind,
        reason: found.kind === 'failing' ? found.reason : null,
      });
    }
  }

  return events;
}

function getNextBreakStart(steps: readonly StatusStep[], returned: StatusStep): number {
  const next = steps.find(
    (step) =>
      step.connection === returned.connection &&
      step.sequence > returned.sequence &&
      (step.step.kind === 'failing' || step.step.kind === 'needs_consent'),
  );

  return next?.sequence ?? Number.MAX_SAFE_INTEGER;
}
