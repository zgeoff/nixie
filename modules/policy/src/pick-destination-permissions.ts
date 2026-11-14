import type { DestinationPermission } from '@heynixie/log';
import { isPatternMatch } from './is-pattern-match';
import type { CallDestination, KnownContact, Rule } from './types';

export interface PermissionSources {
  readonly ownerDestinations: readonly string[];
  readonly contacts: readonly KnownContact[];

  // the allowed destinations of the definition whose task run makes the call
  readonly jobDestinations: readonly string[];

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

  if (sources.jobDestinations.some((pattern) => isPatternMatch(pattern, destination.value))) {
    return 'job';
  }

  const isRuleCovered = sources.allowRules.some((rule) =>
    (rule.destinations ?? []).some((pattern) => isPatternMatch(pattern, destination.value)),
  );

  return isRuleCovered ? 'rule' : null;
}
