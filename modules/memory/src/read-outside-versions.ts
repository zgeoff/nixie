import type { Log } from '@heynixie/log';
import type { TurnNoteRange } from '@heynixie/models';
import { memoryWriterTaskID } from './memory-writer-task-id';
import type { MemoryChange, MemoryOrigin, MemoryTables } from './types';
import type { WriterTables } from './writer-types';

// One version that something other than the conversation wrote.
export interface OutsideVersion {
  readonly item_id: string;
  readonly change: MemoryChange;
  readonly origin: MemoryOrigin;
  readonly sequence: number;
  readonly recorded_at: number;
}

// The outside versions in a range, split into the catch-up's, which the writer wrote before the
// catch-up ended, and every other, each oldest first.
export interface OutsideVersions {
  readonly catchUp: readonly OutsideVersion[];
  readonly listed: readonly OutsideVersion[];
}

// Reads the versions in the range that came from outside the conversation, such as a writer batch
// or an edit in the memory view, and splits off the catch-up's.
export async function readOutsideVersions(
  log: Pick<Log, 'writer'>,
  range: TurnNoteRange,
): Promise<OutsideVersions> {
  const versions = await readVersionRows(log, range);
  const caughtUp = await readCaughtUpSequence(log);

  const isCatchUp = (version: OutsideVersion) =>
    version.origin === 'memory_writer' && (caughtUp === null || version.sequence < caughtUp);

  return {
    catchUp: versions.filter((version) => isCatchUp(version)),
    listed: versions.filter((version) => !isCatchUp(version)),
  };
}

function readVersionRows(
  log: Pick<Log, 'writer'>,
  range: TurnNoteRange,
): Promise<readonly OutsideVersion[]> {
  return log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_versions')
    .select(['item_id', 'change', 'origin', 'sequence', 'recorded_at'])
    .where('sequence', '>', range.after)
    .where('sequence', '<=', range.through)
    .where('origin', '!=', 'conversation')
    .orderBy('sequence')
    .execute();
}

async function readCaughtUpSequence(log: Pick<Log, 'writer'>): Promise<number | null> {
  const writer = await log.writer.db
    .$extendTables<WriterTables>()
    .selectFrom('memory_writer')
    .select('caught_up_sequence')
    .where('writer_id', '=', memoryWriterTaskID)
    .executeTakeFirst();

  return writer?.caught_up_sequence ?? null;
}
