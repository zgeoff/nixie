import type { Log, LogTables } from '@heynixie/log';
import { match } from 'ts-pattern';
import type { MemoryExportMoment } from './memory-export-schema';
import type { MomentTables } from './moment-types';
import { readMomentDetail } from './read-moment-detail';
import type { MomentRow } from './read-moment-row';
import { readMomentSpanPage } from './read-moment-span-page';
import { readPages } from './read-pages';

type ExportLog = Pick<Log, 'deploymentKey' | 'writer'>;

const pageSize = 20;

// Each moment exports with its span's text decrypted, so the file stands alone; a destroyed moment
// exports as its ID and the time its destroy completed.
export function readMomentExport(
  log: ExportLog,
): AsyncGenerator<MemoryExportMoment, void, undefined> {
  return readPages(async (after) => {
    const rows = await log.writer.db
      .$extendTables<MomentTables>()
      .selectFrom('moments')
      .selectAll()
      .where('kept_sequence', '>', after)
      .orderBy('kept_sequence')
      .limit(pageSize + 1)
      .execute();

    const page = rows.slice(0, pageSize);
    const last = page.at(-1);

    return {
      items: await Promise.all(page.map((row) => readExportMoment(log, row))),
      next: rows.length > pageSize && last !== undefined ? last.kept_sequence : null,
    };
  });
}

function readExportMoment(log: ExportLog, row: MomentRow): Promise<MemoryExportMoment> {
  return match(row.state)
    .with('active', 'retired', (state) => readReadableMoment(log, row, state))
    .with('destroying', () => Promise.resolve({ momentID: row.moment_id, destroyedAt: null }))
    .with('destroyed', async () => ({
      momentID: row.moment_id,
      destroyedAt: await readDestroyedAt(log, row),
    }))
    .exhaustive();
}

async function readReadableMoment(
  log: ExportLog,
  row: MomentRow,
  state: 'active' | 'retired',
): Promise<MemoryExportMoment> {
  const detail = await readMomentDetail(log, row);

  const links = await log.writer.db
    .$extendTables<MomentTables>()
    .selectFrom('moment_links')
    .select('item_id')
    .where('moment_id', '=', row.moment_id)
    .orderBy('linked_sequence')
    .execute();

  const span = await readMomentSpanPage(log, {
    thread: row.thread,
    firstSequence: row.first_sequence,
    lastSequence: row.last_sequence,
    after: null,
    tokenCap: Number.POSITIVE_INFINITY,
  });

  return {
    momentID: row.moment_id,
    shortID: row.short_id,
    state,
    thread: row.thread,
    firstSequence: row.first_sequence,
    lastSequence: row.last_sequence,
    keptBy: row.kept_by,
    keptThread: row.kept_thread,
    keptModel: row.kept_model,
    keptAt: new Date(row.kept_at).toISOString(),
    editedAt: row.edited_at === null ? null : new Date(row.edited_at).toISOString(),
    title: detail.title,
    note: detail.note,
    reflections: detail.reflections.map((reflection) => ({
      reflectionID: reflection.reflectionID,
      model: reflection.model,
      writtenAt: new Date(reflection.writtenAt).toISOString(),
      text: reflection.text,
    })),
    links: links.map((link) => link.item_id),
    records: span.entries.map((entry) => ({
      sequence: entry.sequence,
      kind: entry.kind,
      recordedAt: new Date(entry.recordedAt).toISOString(),
      source: entry.source,
      payload: entry.payload,
      decision: entry.decision,
      text: entry.text,
      isGap: entry.isGap,
    })),
  };
}

// The destroy's done record is the moment's last change, so its time is when the destroy completed.
async function readDestroyedAt(log: ExportLog, row: MomentRow): Promise<string | null> {
  const record = await log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('recorded_at')
    .where('sequence', '=', row.updated_sequence)
    .executeTakeFirst();

  return record === undefined ? null : new Date(record.recorded_at).toISOString();
}
