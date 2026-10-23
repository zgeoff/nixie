import type { Log } from '@heynixie/log';
import type { TurnNoteRange } from '@heynixie/sessions';
import { memoryWriterTaskID } from './memory-writer-task-id';
import type { MemoryChange, MemoryOrigin, MemoryTables } from './types';
import type { WriterTables } from './writer-types';

export interface OutsideVersion {
  readonly item_id: string;
  readonly change: MemoryChange;
  readonly origin: MemoryOrigin;
  readonly sequence: number;
  readonly recorded_at: number;
  readonly until: number | null;
}

export interface OutsideVersions {
  readonly catchUp: readonly OutsideVersion[];
  readonly listed: readonly OutsideVersion[];
}

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
    .innerJoin('memory_items', 'memory_items.item_id', 'memory_versions.item_id')
    .select([
      'memory_versions.item_id',
      'memory_versions.change',
      'memory_versions.origin',
      'memory_versions.sequence',
      'memory_versions.recorded_at',
      'memory_versions.until',
    ])
    .where('memory_versions.sequence', '>', range.after)
    .where('memory_versions.sequence', '<=', range.through)
    .where('memory_versions.origin', '!=', 'conversation')
    .where('memory_items.state', 'in', ['active', 'retired'])
    .orderBy('memory_versions.sequence')
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
