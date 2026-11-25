import { readRecords } from '@heynixie/log';
import { sql } from 'kysely';
import type { TasksContext, TasksTables } from '../types';
import { taskRunReportRequestedCodec } from './task-run-report-requested-codec';
import type { TaskRun } from './types';

// The report IDs of the ended task runs whose report request marked the summary as outside content.
export async function readOutsideReportIDs(
  context: Pick<TasksContext, 'log'>,
  runs: readonly TaskRun[],
): Promise<ReadonlySet<string>> {
  const reportIDs = new Set(
    runs.flatMap((run) => (run.ended === null ? [] : [run.ended.record.reportID])),
  );

  if (reportIDs.size === 0) {
    return new Set();
  }

  const rows = await context.log.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('records')
    .select('sequence')
    .where('kind', '=', taskRunReportRequestedCodec.kind)
    .where(
      'thread',
      'in',
      runs.map((run) => run.taskID),
    )
    .where(sql`json_extract(payload, '$.outside')`, '=', 1)
    .execute();

  if (rows.length === 0) {
    return new Set();
  }

  const requests = await readRecords(context.log, {
    afterSequence: 0,
    sequences: rows.map((row) => row.sequence),
    kinds: [taskRunReportRequestedCodec.kind],
    limit: rows.length,
  });

  return new Set(
    requests
      .map((entry) => taskRunReportRequestedCodec.decode(entry.record.payload).reportID)
      .filter((reportID) => reportIDs.has(reportID)),
  );
}
