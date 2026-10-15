import type { SessionEvent, SessionState } from './types';

// The state each step event leaves the session in, for each state that allows the event. A state
// without an event refuses it.
export const sessionTransitions: Readonly<
  Record<SessionState, Readonly<Partial<Record<SessionEvent, SessionState>>>>
> = {
  fresh: { open: 'resumable' },
  summarized: { open: 'resumable' },
  resumable: { resume: 'resumable' },

  // a failed compaction leaves the session to resume, so its turn still runs
  'compaction-due': { compact: 'summarized', resume: 'resumable' },
  invalidated: { open: 'resumable' },
  lost: { open: 'resumable' },
};
