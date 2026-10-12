import type { Turn } from './conversation.ts';

export interface PlannedBatch {
  // Turn indexes, end exclusive.
  end: number;
  start: number;
  // Minutes from the conversation start when the batch starts; null for a backfill batch.
  startedAt: number | null;
  trigger: 'age' | 'count' | 'idle' | 'size';
}

export interface Triggers {
  count: number;
  idleMinutes: number;
  maxAgeMinutes: number;
}

const REPLY_DELAY = 0.5;

// Live mode replays the design's triggers on a virtual clock: a turn commits with its reply, and a
// batch starts on a count of unprocessed turns, on idle time after the last commit, or on the age
// of the oldest unprocessed owner message. Backfill mode cuts the log into fixed-size batches.
export function planBatches(turns: Turn[], mode: { size: number } | Triggers): PlannedBatch[] {
  if ('size' in mode) {
    const batches: PlannedBatch[] = [];
    for (let start = 0; start < turns.length; start += mode.size) {
      batches.push({
        end: Math.min(start + mode.size, turns.length),
        start,
        startedAt: null,
        trigger: 'size',
      });
    }
    return batches;
  }

  const batches: PlannedBatch[] = [];
  let start = 0;
  let committed = 0;
  while (start < turns.length) {
    const nextCommit = committed < turns.length ? turns[committed]!.at + REPLY_DELAY : Infinity;
    const pending = committed - start;
    const idleAt = pending > 0 ? turns[committed - 1]!.at + REPLY_DELAY + mode.idleMinutes : Infinity;
    const ageAt = pending > 0 ? turns[start]!.at + mode.maxAgeMinutes : Infinity;
    const timeoutAt = Math.min(idleAt, ageAt);
    if (nextCommit <= timeoutAt && committed < turns.length) {
      committed += 1;
      if (committed - start >= mode.count) {
        batches.push({ end: committed, start, startedAt: nextCommit, trigger: 'count' });
        start = committed;
      }
    } else if (pending > 0) {
      batches.push({
        end: committed,
        start,
        startedAt: timeoutAt,
        trigger: idleAt <= ageAt ? 'idle' : 'age',
      });
      start = committed;
    } else {
      break;
    }
  }
  return batches;
}
