import { z } from 'zod';
// @boundaries-ignore a spike imports the code it measures
import type { MemoryRef } from '../../../modules/sessions/src/types.ts';
import type { TurnCase } from './build-turn-cases.ts';
import type { PlainRecord } from './read-plain-export.ts';

const pinnedCoreSchema = z.object({ pinnedCore: z.array(z.object({ itemID: z.string(), version: z.int().positive() })).nullish() });

// For each turn, the pinned core that the latest conversation turn-ended record before its step
// lists, which the product compares against to write its change note. That record can come from
// a turn with no retrieval case, and a record with no core counts as an empty core, as the product
// reads it. A turn that opened its session, or has no earlier turn, gets null, because no note
// follows.
export function collectPreviousPinned(
  turns: readonly Pick<TurnCase, 'stepSequence' | 'isSessionStart'>[],
  records: readonly PlainRecord[],
): (MemoryRef[] | null)[] {
  const ended = records
    .filter((record) => record.kind === 'model.turn_ended' && record.thread === 'conversation')
    .map((record) => ({ sequence: record.sequence, core: pinnedCoreSchema.parse(record.payload).pinnedCore ?? [] }));

  return turns.map((turn) => (turn.isSessionStart ? null : (ended.findLast((entry) => entry.sequence < turn.stepSequence)?.core ?? null)));
}
