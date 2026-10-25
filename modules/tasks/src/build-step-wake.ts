import type { EnvelopeRecord } from '@heynixie/log';
import { isWakingRecord } from './is-waking-record';
import { taskMessageCodec } from './task-message-codec';
import type { StepWake } from './types';

export type WakeRecord = Pick<EnvelopeRecord, 'kind' | 'payload' | 'thread'>;

const causeRanks: Readonly<Record<StepWake['cause']['kind'], number>> = {
  owner: 0,
  timer: 1,
  event: 2,
  task: 3,
  carried: 4,
};

export function buildStepWake(unread: readonly WakeRecord[], previousHop: number): StepWake {
  const wakes = unread.filter((record) => isWakingRecord(record)).map((record) => toWake(record));

  const [lowest] = wakes.toSorted(
    (left, right) =>
      left.hop - right.hop || causeRanks[left.cause.kind] - causeRanks[right.cause.kind],
  );

  return lowest ?? { hop: previousHop, cause: { kind: 'carried' } };
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
