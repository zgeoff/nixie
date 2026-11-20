import type { TurnState } from './turn-state';

// The receipt's unlisted uuids never run, so the turn does not wait on them.
export function hasAwaited(state: TurnState): boolean {
  return [...state.pending].some((uuid) => !state.unlisted.has(uuid));
}
