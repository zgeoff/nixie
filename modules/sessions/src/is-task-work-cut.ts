import type { SessionMarks } from './read-session-marks';
import type { SessionFrame } from './types';

// The conversation's interrupt stops nixie mid-reply, so only a started task carries on the work
// that its interrupt cut.
export function isTaskWorkCut(
  frame: SessionFrame,
  marks: Pick<SessionMarks, 'isTurnCut'>,
): boolean {
  return frame.kind === 'task' && marks.isTurnCut;
}
