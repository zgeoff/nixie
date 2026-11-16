import type { Log } from '@heynixie/log';
import type { TurnNoteRange } from '@heynixie/sessions';
import type { MemoryChange, MemoryOrigin, MemoryTables } from '../types';

export interface OutsideVersion {
  readonly item_id: string;
  readonly change: MemoryChange;
  readonly origin: MemoryOrigin;
  readonly sequence: number;
  readonly recorded_at: number;
  readonly until: number | null;
}

// A bridge version that a purge wrote is never a change of yours or of a task, so it stays out.
export function readOutsideVersions(
  log: Pick<Log, 'writer'>,
  range: TurnNoteRange,
): Promise<readonly OutsideVersion[]> {
  return log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_versions')
    .innerJoin('memory_items', 'memory_items.item_id', 'memory_versions.item_id')
    .leftJoin('memory_evidence_purges as bridge', (join) =>
      join
        .onRef('bridge.item_id', '=', 'memory_versions.item_id')
        .onRef('bridge.bridge_version', '=', 'memory_versions.version'),
    )
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
    .where('bridge.purge_key', 'is', null)
    .where('memory_versions.origin', '!=', 'conversation')
    .where('memory_items.state', 'in', ['active', 'retired'])
    .orderBy('memory_versions.sequence')
    .execute();
}
