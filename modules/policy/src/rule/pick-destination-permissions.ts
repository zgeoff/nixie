import type { DestinationPermission } from '@heynixie/log';
import type { PlaceEntry } from '../place/types';
import type { CallDestination, RuleEntry } from '../types';
import { isDestinationPatternMatch } from './is-destination-pattern-match';

// What the decision point found for one destination: whether the text parses as a place, and the
// entry of the directory that covers it.
export interface FoundDestination {
  readonly destination: CallDestination;
  readonly isParsed: boolean;
  readonly place: PlaceEntry | null;
}

export interface PermissionSources {
  // true for a call with only reading effects
  readonly isReadingCall: boolean;

  // the allowed destinations of the definition whose task run makes the call
  readonly taskDestinations: readonly string[];

  // the allow rules that match the whole call
  readonly allowRules: readonly RuleEntry[];
}

// Each destination gets the first permission that covers it, in the order the design sets: its
// place, a plain read, the reply target, the task, then an allow rule.
export function pickDestinationPermissions(
  found: readonly FoundDestination[],
  sources: PermissionSources,
): readonly (DestinationPermission | null)[] {
  return found.map((entry) => pickPermission(entry, sources));
}

function pickPermission(
  found: FoundDestination,
  sources: PermissionSources,
): DestinationPermission | null {
  const destination = found.destination;
  const place = found.place;

  if (place !== null && place.trust !== 'blocked') {
    return { by: 'place', placeID: place.placeID, trust: place.trust };
  }

  if (place === null && found.isParsed && sources.isReadingCall) {
    return { by: 'reading' };
  }

  if (destination.replyTarget) {
    return { by: 'reply_target' };
  }

  if (sources.taskDestinations.some((pattern) => isCovering(pattern, destination.value))) {
    return { by: 'task' };
  }

  const [covering] = sources.allowRules
    .filter((entry) =>
      (entry.rule.destinations ?? []).some((pattern) => isCovering(pattern, destination.value)),
    )
    .toSorted((left, right) => (left.id < right.id ? -1 : 1));

  return covering === undefined ? null : { by: 'rule', ruleID: covering.id };
}

// A pattern with a wildcard never covers an email address: only an exact address holds act trust,
// and a whole domain holds read trust only.
function isCovering(pattern: string, value: string): boolean {
  return isEmailAddress(value) && pattern.includes('*')
    ? false
    : isDestinationPatternMatch(pattern, value);
}

function isEmailAddress(value: string): boolean {
  return /^[^@\s]+@[^@\s]+$/u.test(value);
}
