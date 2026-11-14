import type { LogRecord } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';

// The sequences of the records that hold a report's words, from any one of them: the request, the
// task run's end and the message that went to the report target. A report that nixie kept has no
// message, and a record that belongs to no report gets none.
export async function listReportRecords(
  tx: Transaction<unknown>,
  record: Pick<LogRecord, 'kind' | 'payload'>,
): Promise<readonly number[]> {
  const reportID = pickReportID(record);

  if (reportID === null) {
    return [];
  }

  const result = await sql`select sequence from records
    where (kind in ('task.run_report_requested', 'task.run_ended')
        and json_extract(payload, '$.reportID') = ${reportID})
      or (kind = 'task_message' and json_extract(payload, '$.kind') = 'report'
        and json_extract(payload, '$.messageID') = ${reportID})
    order by sequence`.execute(tx);

  return result.rows.map((row) => z.object({ sequence: z.number() }).parse(row).sequence);
}

function pickReportID(record: Pick<LogRecord, 'kind' | 'payload'>): string | null {
  const key = record.kind === 'task_message' ? 'messageID' : 'reportID';
  const parsed = z.string().safeParse(record.payload[key]);

  return parsed.success ? parsed.data : null;
}
