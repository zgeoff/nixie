interface TurnRecord {
  readonly kind: string;
  readonly sequence: number;
}

// Finds the records of the turn that answered a message: the message's own record, then the first
// step that starts after it, through that step's commit. The check sends its message while no step
// is in flight, so that step is the one that takes it. Answers null until the step commits.
export function findTurnRecords<T extends TurnRecord>(
  records: readonly T[],
  messageSequence: number,
): readonly T[] | null {
  const sorted = records.toSorted((a, b) => a.sequence - b.sequence);
  const message = sorted.find((record) => record.sequence === messageSequence);
  const start = sorted.findIndex(
    (record) => record.kind === 'task.step_started' && record.sequence > messageSequence,
  );
  const commit = sorted.findIndex(
    (record, index) => index > start && record.kind === 'task.step_committed',
  );

  if (message === undefined || start === -1 || commit === -1) {
    return null;
  }
  return [message, ...sorted.slice(start, commit + 1)];
}
