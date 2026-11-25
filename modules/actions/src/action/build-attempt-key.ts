import type { ActionRow } from '../types';

// The key the provider sees for an action's next attempt: the action's ID, then the ID with the
// count of refused attempts once one was refused, as a refusal spends its key at the provider. An
// attempt after an unknown outcome keeps its key.
export function buildAttemptKey(action: Pick<ActionRow, 'action_id' | 'refused_count'>): string {
  return action.refused_count === 0
    ? action.action_id
    : `${action.action_id}.${String(action.refused_count)}`;
}
