import type { LostSession } from './run-rebuilt-turn';

// Renders the line that opens a new session's first turn, so the model knows at once that its
// context starts here: one for a session rebuilt in place of a lost one, one for a fresh session.
export function renderSessionMarker(lost: LostSession | null): string {
  return lost === null
    ? 'This is a new session; earlier history is in the event log.'
    : 'Your context was rebuilt; earlier history is in the event log.';
}
