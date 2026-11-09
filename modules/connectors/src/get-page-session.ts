import type { ToolRun } from '@heynixie/tools';

export interface PageSession {
  readonly sessionKey: string;
  readonly thread: string;

  // the newest session invalidation on the thread when the session's step began, or null for a
  // call of no conversation session
  readonly invalidatedThrough: number | null;
}

// a call under the run's own token runs in no conversation session, so the run keys its links and
// pages, and no forget fences them
export function getPageSession(run: ToolRun): PageSession {
  return {
    sessionKey: run.session?.key ?? run.runID,
    thread: run.thread,
    invalidatedThrough: run.session?.invalidatedThrough ?? null,
  };
}
