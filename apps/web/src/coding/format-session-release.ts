import type { ListedSession } from './format-session-state';

// What a stop or a close of the task does to its session: nixie stops a session it started, and
// leaves a session it joined running, as the user's. Null for a task with no session.
export function formatSessionRelease(session: ListedSession | undefined): string | null {
  if (session === undefined) {
    return null;
  }

  return session.origin === 'started'
    ? 'This also stops its coding session.'
    : 'Its coding session keeps running, as yours.';
}
