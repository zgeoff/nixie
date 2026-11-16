import type { TaskRun, TriggerDetails } from '@heynixie/tasks';

export interface RunBlocksTurn {
  readonly stepKey: string;

  // whether the turn opens a session, which holds none of the blocks yet
  readonly isNewSession: boolean;
}

export interface RunTrigger {
  readonly details: TriggerDetails;

  // the IANA zone the details' times are in
  readonly zone: string;
}

// A session holds the blocks it was given, so a turn renders them only in a new session or at the
// first step of an uncarried task run.
export function isRunBlocksTurn(run: TaskRun, turn: RunBlocksTurn): boolean {
  const isFirstStep = turn.stepKey === run.opened.openedByStep && run.opened.carriesRunID === null;

  return turn.isNewSession || isFirstStep;
}

// The trigger block comes first, then the report shape. The report shape's fence is the start of the
// run's ID, which the model never sees, so a rerun and a rebuild render the same block and no text
// can close it early. The trigger block holds only code-made text, so it needs no fence.
export function renderRunBlocks(
  run: TaskRun,
  turn: RunBlocksTurn,
  trigger: RunTrigger | null,
): string | null {
  if (!isRunBlocksTurn(run, turn)) {
    return null;
  }

  const blocks = [renderTriggerBlock(trigger), renderShapeBlock(run)].filter(
    (block) => block !== null,
  );

  return blocks.length === 0 ? null : blocks.join('\n');
}

function renderTriggerBlock(trigger: RunTrigger | null): string | null {
  return trigger === null
    ? null
    : [
        '<input name="trigger">',
        `${trigger.details.sentence} Times are in ${trigger.zone}.`,
        '</input>',
      ].join('\n');
}

function renderShapeBlock(run: TaskRun): string | null {
  const shape = run.opened.reportShape;

  if (shape === null) {
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
