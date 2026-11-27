import type { ListedSession } from './format-session-state';

// What a stop or a close of the task does to its session: nixie stops a session it started. Null for
// a task with no session, for a joined session, which the live view shows nothing of, and for one
// whose session the task already let go of, because a close then does nothing more to it.
export function formatSessionRelease(session: ListedSession | undefined): string | null {
  if (session?.origin !== 'started' || session.isReleased) {
    return null;
  }

  return 'This also stops its coding session.';
}
