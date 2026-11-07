import type { Log } from '@heynixie/log';
import { buildMomentText } from './build-moment-text';
import type { MomentTables } from './moment-types';
import { readMomentDetail } from './read-moment-detail';
import type { IndexEntry } from './start-memory-index';

export interface MomentEntries {
  readonly entries: readonly IndexEntry[];
  readonly removedIDs: readonly string[];
  readonly through: number;
}

export async function readMomentEntries(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  afterSequence: number,
): Promise<MomentEntries> {
  const rows = await log.writer.db
    .$extendTables<MomentTables>()
    .selectFrom('moments')
    .selectAll()
    .where('updated_sequence', '>', afterSequence)
    .orderBy('updated_sequence')
    .execute();

  const live = rows.filter((row) => row.state === 'active' || row.state === 'retired');

  const details = await Promise.all(live.map((row) => readMomentDetail(log, row)));

  const entries = live.flatMap((row, index) => {
    const detail = details[index];
    const text = detail === undefined ? '' : buildMomentText(detail);

    return text.trim() === '' ? [] : [{ itemID: row.moment_id, text }];
  });

  const indexed = new Set(entries.map((entry) => entry.itemID));

  return {
    entries,
    removedIDs: rows.map((row) => row.moment_id).filter((momentID) => !indexed.has(momentID)),
    through: rows.at(-1)?.updated_sequence ?? afterSequence,
  };
}
