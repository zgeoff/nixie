import { isCompactionDue } from '@heynixie/compaction';
import type { SessionPoint } from '@heynixie/wire';
import type { SessionMarks } from './read-session-marks';
import type { SessionPosition } from './types';

export interface SessionPositionInput {
  readonly marks: Pick<
    SessionMarks,
    | 'isInvalidated'
    | 'hasOpening'
    | 'isBriefUnmarked'
    | 'openedPersonaHash'
    | 'isSummarized'
    | 'lastContext'
  >;

  readonly personaHash: string;

  // whether the session belongs to a started task, which has a brief
  readonly isTask: boolean;

  readonly boundary: SessionPoint | null;

  readonly threshold: number;
}

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

  // A session that the release before opened never held the brief, so the next step rebuilds it
  // once with the brief pinned. Remove this when every open session's opening has the mark.
  if (input.isTask && input.marks.isBriefUnmarked) {
    return { state: 'lost', boundary: input.boundary };
  }

  if (isPersonaChanged(input)) {
    return { state: 'invalidated', boundary: input.boundary, cause: 'persona' };
  }

  const isDue = isCompactionDue(input.marks.lastContext, input.threshold);

  return { state: isDue ? 'compaction-due' : 'resumable', boundary: input.boundary };
}

function isPersonaChanged(input: SessionPositionInput): boolean {
  const opened = input.marks.openedPersonaHash;

  return opened !== null && opened !== input.personaHash;
}
