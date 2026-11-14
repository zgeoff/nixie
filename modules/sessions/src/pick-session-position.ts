import { isCompactionDue } from '@heynixie/compaction';
import type { HarnessSession } from '@heynixie/models';
import type { HarnessCapability, SessionPoint } from '@heynixie/wire';
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

  // the stored point, whichever harness wrote it
  readonly boundary: SessionPoint | null;

  // the step's harness's session, or null for a harness with none
  readonly session: HarnessSession | null;
  readonly capabilities: ReadonlySet<HarnessCapability>;

  readonly threshold: number;
}

// A point that the harness's session does not own counts as no point, so the step rebuilds the
// session from the log.
export function pickSessionPosition(input: SessionPositionInput): SessionPosition {
  const boundary = pickOwnedPoint(input);

  if (input.marks.isInvalidated) {
    return { state: 'invalidated', boundary, cause: 'forget' };
  }

  if (boundary === null) {
    return pickUnownedPosition(input);
  }

  if (!input.marks.hasOpening) {
    return { state: 'lost', boundary };
  }

  // A session that the release before opened never held the brief, so the next step rebuilds it
  // once with the brief pinned. Remove this when every open session's opening has the mark.
  if (input.isTask && input.marks.isBriefUnmarked) {
    return { state: 'lost', boundary };
  }

  if (isPersonaChanged(input)) {
    return { state: 'invalidated', boundary, cause: 'persona' };
  }

  const isDue =
    input.capabilities.has('summarize') &&
    input.capabilities.has('context-window') &&
    isCompactionDue(input.marks.lastContext, input.threshold);

  return { state: isDue ? 'compaction-due' : 'resumable', boundary };
}

function pickOwnedPoint(input: SessionPositionInput): SessionPoint | null {
  return input.boundary !== null && input.session?.owns(input.boundary) === true
    ? input.boundary
    : null;
}

function pickUnownedPosition(input: SessionPositionInput): SessionPosition {
  if (input.marks.isSummarized) {
    return { state: 'summarized', boundary: null };
  }

  if (!input.marks.hasOpening) {
    return { state: 'fresh', boundary: null };
  }

  if (isPersonaChanged(input)) {
    return { state: 'invalidated', boundary: null, cause: 'persona' };
  }

  return { state: 'unkept', boundary: null };
}

function isPersonaChanged(input: SessionPositionInput): boolean {
  const opened = input.marks.openedPersonaHash;

  return opened !== null && opened !== input.personaHash;
}
