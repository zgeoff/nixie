import type { StepWake } from '../types';
import { isWakingRecord } from '../utils/is-waking-record';
import { taskMessageCodec } from '../utils/task-message-codec';
import type { WakeRecord } from './build-step-wake';

const causeRanks: Readonly<Record<StepWake['cause']['kind'], number>> = {
  owner: 0,
  timer: 1,
  event: 2,
  task: 3,
  carried: 4,
};

export interface WakeSource<Record extends WakeRecord> {
  readonly record: Record;
  readonly wake: StepWake;
}

// The waking record that gives a step its hop and cause: the lowest hop, then the cause that ranks
// first.
export function pickWakeSource<Record extends WakeRecord>(
  unread: readonly Record[],
): WakeSource<Record> | null {
  const [lowest] = unread
    .filter((record) => isWakingRecord(record))
    .map((record) => ({ record, wake: toWake(record) }))
    .toSorted(
      (left, right) =>
        left.wake.hop - right.wake.hop ||
        causeRanks[left.wake.cause.kind] - causeRanks[right.wake.cause.kind],
    );

  return lowest ?? null;
}

function toWake(record: WakeRecord): StepWake {
  if (record.kind === 'owner_message') {
    return { hop: 0, cause: { kind: 'owner' } };
  }

  if (record.kind === 'timer.fired') {
    return { hop: 0, cause: { kind: 'timer' } };
  }

  if (record.kind === 'task_message') {
    const message = taskMessageCodec.decode(record.payload);

    return { hop: message.hop, cause: { kind: 'task', taskID: message.from } };
  }

  return { hop: 0, cause: { kind: 'event' } };
}
