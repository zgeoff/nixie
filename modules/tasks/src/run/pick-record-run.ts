import type { TaskRun } from './types';

interface RecordPosition {
  readonly sequence: number;
  readonly taskRunID?: string | undefined;
}

// The rule of which task run a record belongs to. The runs are the task's rows, oldest first.
export function pickRecordRun(record: RecordPosition, runs: readonly TaskRun[]): TaskRun | null {
  if (record.taskRunID !== undefined) {
    return runs.find((run) => run.runID === record.taskRunID) ?? null;
  }

  const opened = runs.find((run) => run.opened.origin.sequence === record.sequence);

  if (opened !== undefined) {
    return opened;
  }

  return (
    runs.findLast(
      (run) =>
        run.openedSequence <= record.sequence &&
        (run.ended === null || run.ended.sequence >= record.sequence),
    ) ?? null
  );
}
