import type { LogRecord } from '../../../libs/contract/src/index';

// Finds the records of the turn that answered a message: from the message's own record to the
// first step commit after it, in sequence order. Answers null while that step has not committed.
export function findTurnRecords(
  records: readonly LogRecord[],
  messageSequence: number,
): readonly LogRecord[] | null {
  const after = records
    .filter((record) => record.sequence >= messageSequence)
    .toSorted((a, b) => a.sequence - b.sequence);
  const commit = after.findIndex(
    (record) => record.kind === 'task.step_committed' && record.sequence > messageSequence,
  );

  return commit === -1 ? null : after.slice(0, commit + 1);
}
