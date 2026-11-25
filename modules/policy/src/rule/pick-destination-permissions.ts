import type { DestinationPermission } from '@heynixie/log';
import type { CallDestination, KnownContact, Rule } from '../types';
import { isPatternMatch } from './is-pattern-match';

export interface PermissionSources {
  readonly ownerDestinations: readonly string[];
  readonly contacts: readonly KnownContact[];

  // the allowed destinations of the definition whose task run makes the call
  readonly taskDestinations: readonly string[];

  // the allow rules that match the whole call
  readonly allowRules: readonly Rule[];
}

// Each destination gets the first permission that covers it, in the order the design sets.
export function pickDestinationPermissions(
  destinations: readonly CallDestination[],
  sources: PermissionSources,
): readonly (DestinationPermission | null)[] {
  return destinations.map((destination) => pickPermission(destination, sources));
}

function pickPermission(
  destination: CallDestination,
  sources: PermissionSources,
): DestinationPermission | null {
  if (sources.ownerDestinations.includes(destination.value)) {
    return 'owner';
  }

  if (destination.replyTarget) {
    return 'reply_target';
  }

  if (sources.contacts.some((contact) => contact.destination === destination.value)) {
    return 'known_contact';
  }

  if (sources.taskDestinations.some((pattern) => isCovering(pattern, destination.value))) {
    return 'task';
  }

  const isRuleCovered = sources.allowRules.some((rule) =>
    (rule.destinations ?? []).some((pattern) => isCovering(pattern, destination.value)),
  );

  return isRuleCovered ? 'rule' : null;
}

// A pattern with a wildcard never covers an email address: only an exact address holds act trust,
// and a whole domain holds read trust only.
function isCovering(pattern: string, value: string): boolean {
  return isEmailAddress(value) && pattern.includes('*') ? false : isPatternMatch(pattern, value);
}

function isEmailAddress(value: string): boolean {
  return /^[^@\s]+@[^@\s]+$/u.test(value);
}
