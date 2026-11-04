interface ThreadRecord {
  readonly sequence: number;
  readonly kind: string;
}

interface ThreadPage {
  readonly records: readonly ThreadRecord[];
  readonly lastStepEnd?: ThreadRecord | null;
}

// The API's records hold no step's read cursor, so a step that started before the sent message and
// ended after it can still pass. A failed model call ends its step with an error and no reply.
export function isStepEnded(page: ThreadPage, afterSequence: number): boolean {
  const stepEnd = page.lastStepEnd;

  if (stepEnd === null || stepEnd === undefined || stepEnd.sequence <= afterSequence) {
    return false;
  }

  return (
    stepEnd.kind === 'task.step_errored' ||
    page.records.some(
      (record) =>
        record.kind === 'model.reply' &&
        record.sequence > afterSequence &&
        record.sequence < stepEnd.sequence,
    )
  );
}
