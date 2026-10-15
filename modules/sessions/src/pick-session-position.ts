import { isCompactionDue } from '@heynixie/compaction';
import type { SessionPoint } from '@heynixie/wire';
import type { SessionMarks } from './read-session-marks';
import type { SessionPosition } from './types';

export interface SessionPositionInput {
  readonly marks: Pick<
    SessionMarks,
    'isInvalidated' | 'hasOpening' | 'isSummarized' | 'lastContext'
  >;

  // the boundary the task's last step committed, or null when no session is open
  readonly boundary: SessionPoint | null;

  // the share of the window past which a resumable session compacts first
  readonly threshold: number;
}

// The one resume rule: a session resumes at its boundary only when a forget has not invalidated it
// since the last turn read its marks, and some session opened with an opening record, which holds
// the pinned core a resumed turn needs.
export function pickSessionPosition(input: SessionPositionInput): SessionPosition {
  if (input.marks.isInvalidated) {
    return { state: 'invalidated', boundary: input.boundary };
  }

  if (input.boundary === null) {
    return { state: input.marks.isSummarized ? 'summarized' : 'fresh', boundary: null };
  }

  if (!input.marks.hasOpening) {
    return { state: 'lost', boundary: input.boundary };
  }

  const isDue = isCompactionDue(input.marks.lastContext, input.threshold);

  return { state: isDue ? 'compaction-due' : 'resumable', boundary: input.boundary };
}
