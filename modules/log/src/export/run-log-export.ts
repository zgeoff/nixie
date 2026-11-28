import type { ExportColumn, ExportValue } from '@heynixie/db';
import { writeExportFile } from '@heynixie/db';
import { readRecords } from '../record/read-records';
import type { Log, LogRecord, LogTables } from '../types';

export interface LogExport {
  readonly records: number;

  // the records whose free text the file leaves null, because its key is gone or unreadable
  readonly gaps: number;
}

const exportTable = 'records';

const exportColumns: readonly ExportColumn[] = [
  { name: 'sequence', type: 'integer' },
  { name: 'recorded_at', type: 'text' },
  { name: 'kind', type: 'text' },
  { name: 'thread', type: 'text' },
  { name: 'parent', type: 'integer' },
  { name: 'step_key', type: 'text' },
  { name: 'content_source', type: 'text' },
  { name: 'decision', type: 'text' },
  { name: 'approval', type: 'text' },
  { name: 'payload', type: 'text' },
  { name: 'text', type: 'text' },
  { name: 'text_status', type: 'text' },
];

// Writes every record the log holds when the export starts into a new SQLite file, with the free
// text of each record decrypted. A record whose text is shredded or unreadable keeps its envelope
// and payload, and the file holds a null text with the reason in text_status.
export async function runLogExport(log: Log, path: string): Promise<LogExport> {
  const lastSequence = await readLastSequence(log);

  const counts = { gaps: 0 };

  const records = await writeExportFile(path, {
    table: exportTable,
    columns: exportColumns,
    rows: readRows(log, lastSequence, counts),
  });

  return { records, gaps: counts.gaps };
}

async function readLastSequence(log: Log): Promise<number> {
  const row = await log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select((builder) => builder.fn.max('sequence').as('last'))
    .executeTakeFirst();

  return row?.last ?? 0;
}

interface GapCount {
  gaps: number;
}

const pageSize = 500;

async function* readRows(
  log: Log,
  lastSequence: number,
  counts: GapCount,
): AsyncGenerator<readonly ExportValue[]> {
  let after = 0;

  while (after < lastSequence) {
    const page = await readRecords(log, {
      afterSequence: after,
      beforeSequence: lastSequence + 1,
      limit: pageSize,
    });

    if (page.length === 0) {
      return;
    }

    for (const entry of page) {
      const record = entry.record;

      if (record.erasable.status === 'shredded' || record.erasable.status === 'unreadable') {
        counts.gaps += 1;
      }

      yield toExportRow(record);
    }

    after = page.at(-1)?.record.sequence ?? lastSequence;
  }
}

function toExportRow(record: LogRecord): readonly ExportValue[] {
  return [
    record.sequence,
    record.recordedAt.toISOString(),
    record.kind,
    record.thread,
    record.parent,
    record.stepKey,
    record.contentSource,
    record.decision === null ? null : JSON.stringify(record.decision),
    record.approval === null ? null : JSON.stringify(record.approval),
    JSON.stringify(record.payload),
    record.erasable.status === 'readable' ? JSON.stringify(record.erasable.fields) : null,
    record.erasable.status,
  ];
}
