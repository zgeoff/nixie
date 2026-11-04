interface ThreadRecord {
  readonly sequence: number;
  readonly kind: string;
  readonly task?:
    | { readonly readCursor?: number | undefined; readonly stepKey?: string | undefined }
    | undefined;
}

interface ThreadPage {
  readonly records: readonly ThreadRecord[];
  readonly lastStepEnd?: ThreadRecord | null;
}

export function isStepEnded(page: ThreadPage, sentSequence: number): boolean {
  const stepEnd = page.lastStepEnd;

  if (stepEnd === null || stepEnd === undefined) {
    return false;
  }

  if (stepEnd.kind === 'task.step_errored') {
    return isStartedAfter(page.records, stepEnd, sentSequence);
  }

  const readCursor = stepEnd.task?.readCursor;

  return readCursor !== undefined && readCursor >= sentSequence;
}

// A failed step's record holds no read cursor, and a step reads every message written before it
// starts, so the step answers the message when its start comes after it.
function isStartedAfter(
  records: readonly ThreadRecord[],
  stepEnd: ThreadRecord,
  sentSequence: number,
): boolean {
  const stepKey = stepEnd.task?.stepKey;

  return records.some(
    (record) =>
      record.kind === 'task.step_started' &&
      stepKey !== undefined &&
      record.task?.stepKey === stepKey &&
      record.sequence > sentSequence &&
      record.sequence < stepEnd.sequence,
  );
}
