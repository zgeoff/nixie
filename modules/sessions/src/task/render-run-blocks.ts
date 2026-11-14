import type { TaskRun } from '@heynixie/tasks';

export interface RunBlocksTurn {
  readonly stepKey: string;

  // whether the turn opens a session, which holds none of the blocks yet
  readonly isNewSession: boolean;
}

// A session holds the blocks it was given, so a turn renders them only in a new session or at the
// first step of an uncarried task run. The fence is the start of the run's ID, which the model never
// sees, so a rerun and a rebuild render the same block and no text can close it early.
export function renderRunBlocks(run: TaskRun, turn: RunBlocksTurn): string | null {
  const shape = run.opened.reportShape;
  const isFirstStep = turn.stepKey === run.opened.openedByStep && run.opened.carriesRunID === null;

  if (shape === null || !(turn.isNewSession || isFirstStep)) {
    return null;
  }

  const fence = run.runID.replaceAll('-', '').slice(0, 4);

  return [
    `<report-shape fence="${fence}">`,
    'End this run with task.report. Beside summary, pass fields that match this schema:',
    JSON.stringify(shape),
    `</report-shape fence="${fence}">`,
  ].join('\n');
}
