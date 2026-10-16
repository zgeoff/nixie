import { isCompactionDue } from '@heynixie/compaction';
import type { SessionPoint } from '@heynixie/wire';
import type { SessionMarks } from './read-session-marks';
import type { SessionPosition } from './types';

export interface SessionPositionInput {
  readonly marks: Pick<
    SessionMarks,
    'isInvalidated' | 'hasOpening' | 'openedPersonaHash' | 'isSummarized' | 'lastContext'
  >;

  // the persona hash of the definitions in force as the step begins
  readonly personaHash: string;

  // the boundary the task's last step committed, or null when no session is open
  readonly boundary: SessionPoint | null;

  // the share of the window past which a resumable session compacts first
  readonly threshold: number;
}

// The one resume rule: a session resumes at its boundary only when no forget invalidated it since
// the last turn read its marks, and it opened with an opening record under the persona in force.
// Each tool call reads the policy in force, so a policy change never invalidates a session.
export function pickSessionPosition(input: SessionPositionInput): SessionPosition {
  if (input.marks.isInvalidated) {
    return { state: 'invalidated', boundary: input.boundary, cause: 'forget' };
  }

  if (input.boundary === null) {
    return { state: input.marks.isSummarized ? 'summarized' : 'fresh', boundary: null };
  }

  if (!input.marks.hasOpening) {
    return { state: 'lost', boundary: input.boundary };
  }

  if (isPersonaChanged(input)) {
    return { state: 'invalidated', boundary: input.boundary, cause: 'persona' };
  }

  const isDue = isCompactionDue(input.marks.lastContext, input.threshold);

  return { state: isDue ? 'compaction-due' : 'resumable', boundary: input.boundary };
}

// a session opened before openings kept the persona hash resumes, since nothing shows that its
// persona changed
function isPersonaChanged(input: SessionPositionInput): boolean {
  const opened = input.marks.openedPersonaHash;

  return opened !== null && opened !== input.personaHash;
}
