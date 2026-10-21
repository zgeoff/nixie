import type { SessionEvent, SessionState } from './types';

export const sessionTransitions: Readonly<
  Record<SessionState, Readonly<Partial<Record<SessionEvent, SessionState>>>>
> = {
  fresh: { open: 'resumable' },
  summarized: { open: 'resumable' },
  resumable: { resume: 'resumable' },

  'compaction-due': { compact: 'summarized', resume: 'resumable' },
  invalidated: { open: 'resumable' },
  lost: { open: 'resumable' },
};
