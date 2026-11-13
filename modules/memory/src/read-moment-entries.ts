import type { Log } from '@heynixie/log';
import { buildMomentText } from './build-moment-text';
import type { MomentEntries } from './collect-moment-entries';
import { collectMomentEntries } from './collect-moment-entries';
import { isIndexedMomentState } from './is-indexed-moment-state';
import type { MomentTables } from './moment-context';
import { readMomentDetail } from './read-moment-detail';

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

  const indexed = rows.filter((row) => isIndexedMomentState(row.state));

  const details = await Promise.all(indexed.map((row) => readMomentDetail(log, row)));

  const texts = new Map(
    indexed.flatMap((row, index) => {
      const detail = details[index];

      return detail === undefined ? [] : [[row.moment_id, buildMomentText(detail)] as const];
    }),
  );

  return collectMomentEntries(rows, texts, afterSequence);
}
