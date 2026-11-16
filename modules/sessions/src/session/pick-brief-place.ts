import type { TaskBrief, TaskRun } from '@heynixie/tasks';
import type { SessionStart } from '../types';

// Where the model reads the brief of a definition's task run, which sits in no inbox record:
// last in the preamble of the run's first turn, pinned in the opening of a rebuilt or compacted
// session, or not at all because the session already holds it.
export type BriefPlace = 'preamble' | 'pinned' | 'none';

export interface BriefPlaceInput {
  readonly brief: TaskBrief | null;

  // the open task run of the step, or null
  readonly run: TaskRun | null;
  readonly stepKey: string;

  // the start of the session that the turn opens, or null for a turn that resumes one
  readonly start: SessionStart | null;
}

// A brief of another origin keeps the place that the turn context and the opening already give it.
export function pickBriefPlace(input: BriefPlaceInput): BriefPlace {
  if (input.brief?.origin !== 'definition' || input.run === null) {
    return 'none';
  }

  if (input.start === null) {
    const isFirstStep =
      input.stepKey === input.run.opened.openedByStep && input.run.opened.carriesRunID === null;

    return isFirstStep ? 'preamble' : 'none';
  }

  return input.start.kind === 'first' ? 'preamble' : 'pinned';
}
