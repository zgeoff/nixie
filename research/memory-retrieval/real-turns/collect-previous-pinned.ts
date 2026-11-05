import { z } from 'zod';
// @boundaries-ignore a spike imports the code it measures
import type { MemoryRef } from '../../../modules/sessions/src/types.ts';
import type { TurnCase } from './build-turn-cases.ts';
import type { PlainRecord } from './read-plain-export.ts';

const pinnedCoreSchema = z.object({ pinnedCore: z.array(z.object({ itemID: z.string(), version: z.int().positive() })).nullish() });

// The product reads a turn-ended record with no pinned core as an empty core, and writes no change
// note on a session opening or on a turn with no earlier turn.
export function collectPreviousPinned(
  turns: readonly Pick<TurnCase, 'stepSequence' | 'isSessionStart'>[],
  records: readonly PlainRecord[],
): (MemoryRef[] | null)[] {
  const ended = records
    .filter((record) => record.kind === 'model.turn_ended' && record.thread === 'conversation')
    .map((record) => ({ sequence: record.sequence, core: pinnedCoreSchema.parse(record.payload).pinnedCore ?? [] }));

  return turns.map((turn) => (turn.isSessionStart ? null : (ended.findLast((entry) => entry.sequence < turn.stepSequence)?.core ?? null)));
}
