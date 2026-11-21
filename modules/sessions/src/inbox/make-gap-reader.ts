import type { LogRecord } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';
import { conversationTaskID } from '@heynixie/tasks';
import type { GapReader } from '../types';
import { buildTurnGaps } from './build-turn-gaps';

// Reads the gaps of a conversation turn from records the log already holds. A turn ends with a
// turn-ended record, or with a step-errored record when it failed.
export function makeGapReader(context: Pick<TasksContext, 'log' | 'clock'>): GapReader {
  return async (record) => {
    const startedAtMs = context.clock.now();
    const isOwnerMessage = record.kind === 'owner_message';
    const ownerBeforeSequence = isOwnerMessage ? record.sequence : undefined;

    const [lastTurn, ownerBefore] = await Promise.all([
      readNewest(context, ['model.turn_ended', 'task.step_errored']),
      readNewest(context, ['owner_message'], ownerBeforeSequence),
    ]);

    return buildTurnGaps({
      startedAtMs,
      lastTurnEndedAtMs: lastTurn?.recordedAt.getTime() ?? null,
      ownerGapEndsAtMs: isOwnerMessage ? record.recordedAt.getTime() : startedAtMs,
      ownerLastWroteAtMs: ownerBefore?.recordedAt.getTime() ?? null,
    });
  };
}

async function readNewest(
  context: Pick<TasksContext, 'log'>,
  kinds: readonly LogRecord['kind'][],
  beforeSequence?: number,
): Promise<LogRecord | null> {
  const [entry] = await readRecords(context.log, {
    afterSequence: 0,
    thread: conversationTaskID,
    kinds,
    limit: 1,
    order: 'newest',
    ...(beforeSequence === undefined ? {} : { beforeSequence }),
  });

  return entry?.record ?? null;
}
