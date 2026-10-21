import { isCompactionDue } from '@heynixie/compaction';
import type { SessionPoint } from '@heynixie/wire';
import type { SessionMarks } from './read-session-marks';
import type { SessionPosition } from './types';

export interface SessionPositionInput {
  readonly marks: Pick<
    SessionMarks,
    'isInvalidated' | 'hasOpening' | 'openedPersonaHash' | 'isSummarized' | 'lastContext'
  >;

  readonly personaHash: string;

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
