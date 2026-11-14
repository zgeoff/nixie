import { parseJSONObject } from '@heynixie/log';
import { listReportRecords } from '@heynixie/tasks';
import type { APIContext, APITables } from '../types';

// The other records that hold the words of the report that a forgotten record belongs to, or none
// for a record that is no part of a report. They go with the forgotten record, so no copy remains.
export async function readReportRecords(
  context: Pick<APIContext, 'log'>,
  sequence: number,
): Promise<readonly number[]> {
  const db = context.log.writer.db;

  const target = await db
    .$extendTables<APITables>()
    .selectFrom('records')
    .select(['kind', 'payload'])
    .where('sequence', '=', sequence)
    .executeTakeFirst();

  if (target === undefined) {
    return [];
  }

  const sequences = await listReportRecords(db, {
    kind: target.kind,
    payload: parseJSONObject(target.payload),
  });

  return sequences.filter((other) => other !== sequence);
}
