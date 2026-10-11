import type { LogLine } from './parse-log-lines';

// The writer's handover across a rollout, from the logs of the old pod and the new one: the epoch
// each held, when the old pod's server stopped, and when the new pod's writer opened the database.
export interface WriterHandover {
  // null when the runtime rotated the old pod's first log lines away
  readonly oldEpoch: number | null;
  readonly oldStoppedAt: Date;
  readonly newEpoch: number;
  readonly newStartedAt: Date;
}

// Finds the handover in the 2 logs. nixie logs stopped only after its writer closes, and logs
// writer.started once it holds the writer lock and has migrated the database. Answers null when the
// old log lacks its stop, such as for a pod killed before it stopped, or the new log lacks its start.
export function findWriterHandover(
  oldLines: readonly LogLine[],
  newLines: readonly LogLine[],
): WriterHandover | null {
  const oldStart = oldLines.findLast((line) => line.event === 'writer.started');
  const oldStop = oldLines.findLast((line) => line.event === 'stopped');
  const newStart = newLines.find((line) => line.event === 'writer.started');
  const oldEpoch = oldStart?.fields['epoch'];
  const newEpoch = newStart?.fields['epoch'];

  if (oldStop === undefined || newStart === undefined || typeof newEpoch !== 'number') {
    return null;
  }
  return {
    oldEpoch: typeof oldEpoch === 'number' ? oldEpoch : null,
    oldStoppedAt: oldStop.time,
    newEpoch,
    newStartedAt: newStart.time,
  };
}
