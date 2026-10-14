import type { Log, LogRecord, LogTables, RecordWithChanges } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { z } from 'zod';
import { renderShownText } from './render-shown-text';

export interface LogPageQuery {
  readonly thread: string;

  // the cursor: only entries after this sequence
  readonly after: number;

  // only entries recorded at or after this time, in epoch milliseconds, or null for no bound
  readonly from: number | null;

  // only entries recorded before this time, in epoch milliseconds, or null for no bound
  readonly to: number | null;

  // only entries whose text holds every one of these words, in any case
  readonly words: readonly string[];
  readonly limit: number;
}

// One entry of the thread: your message, a reply, or a tool's result, by the record's sequence.
// The text is null once a forget erased it, and a long text is cut.
export interface LogEntry {
  readonly sequence: number;
  readonly role: 'owner' | 'assistant' | 'tool';
  readonly recordedAt: number;
  readonly text: string | null;
  readonly isCut: boolean;
}

// The entries of one page, oldest first, and the cursor of the next page, or null at the end.
export interface LogPage {
  readonly entries: readonly LogEntry[];
  readonly next: number | null;
}

// Reads one page of a thread's messages, replies and tool results, oldest first, in a time range
// and with every word of a search. A read decrypts at most scanLimit records, so a search over a
// long log can return a short page, with the cursor to go on from.
export async function readLogPage(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  query: LogPageQuery,
): Promise<LogPage> {
  const bounds = await readSequenceBounds(log, query);

  if (bounds === null) {
    return { entries: [], next: null };
  }
  const scan = await collectPageEntries(log, query, bounds);

  return { entries: scan.entries, next: scan.after >= bounds.through ? null : scan.after };
}

// the kinds a thread's reader sees: your messages, the replies, and each tool's result
const entryKinds = ['owner_message', 'model.reply', 'tool_result'];

const batchSize = 100;

const scanLimit = 500;

const textLimit = 2000;

interface SequenceBounds {
  readonly after: number;
  readonly through: number;
}

// The first and last sequences in the time range after the cursor, so a read never decrypts a
// record outside it. The sequence grows in commit order, as the record times do.
async function readSequenceBounds(
  log: Pick<Log, 'writer'>,
  query: LogPageQuery,
): Promise<SequenceBounds | null> {
  const row = await log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select((eb) => [eb.fn.min('sequence').as('first'), eb.fn.max('sequence').as('last')])
    .where('thread', '=', query.thread)
    .where('kind', 'in', entryKinds)
    .where('sequence', '>', query.after)
    .$if(query.from !== null, (select) => select.where('recorded_at', '>=', query.from ?? 0))
    .$if(query.to !== null, (select) => select.where('recorded_at', '<', query.to ?? 0))
    .executeTakeFirst();

  if (row?.first === null || row?.first === undefined || row.last === null) {
    return null;
  }
  return { after: row.first - 1, through: row.last };
}

interface PageScan {
  readonly entries: LogEntry[];

  // the last sequence the scan read, and how many records it read
  after: number;
  scanned: number;
}

async function collectPageEntries(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  query: LogPageQuery,
  bounds: SequenceBounds,
): Promise<PageScan> {
  const words = query.words.map((word) => normalizeSearchText(word)).filter((word) => word !== '');
  const scan: PageScan = { entries: [], after: bounds.after, scanned: 0 };

  while (
    scan.entries.length < query.limit &&
    scan.scanned < scanLimit &&
    scan.after < bounds.through
  ) {
    // oxlint-disable-next-line no-await-in-loop -- each batch starts after the one before
    const batch = await readRecords(log, {
      afterSequence: scan.after,
      beforeSequence: bounds.through + 1,
      thread: query.thread,
      kinds: entryKinds,
      limit: batchSize,
    });

    if (batch.length === 0) {
      scan.after = bounds.through;
    }
    updatePageScan(scan, batch, { query, words });
  }
  return scan;
}

interface EntryFilter {
  readonly query: LogPageQuery;
  readonly words: readonly string[];
}

// adds each record of the batch that passes the filter, until the page is full
function updatePageScan(
  scan: PageScan,
  batch: readonly RecordWithChanges[],
  filter: EntryFilter,
): void {
  for (const read of batch) {
    if (scan.entries.length === filter.query.limit) {
      return;
    }
    scan.after = read.record.sequence;
    scan.scanned += 1;

    const entry = buildLogEntry(read.record);

    if (isInRange(entry, filter.query) && hasEveryWord(entry, filter.words)) {
      scan.entries.push(toShownEntry(entry));
    }
  }
}

function buildLogEntry(record: LogRecord): LogEntry {
  const base = { sequence: record.sequence, recordedAt: record.recordedAt.getTime(), isCut: false };
  const fields = record.erasable.status === 'readable' ? record.erasable.fields : null;

  if (record.kind === 'owner_message') {
    const parsed = ownerFields.safeParse(fields);

    return {
      ...base,
      role: 'owner',
      text: parsed.success ? renderShownText(parsed.data.text, parsed.data.spans ?? []) : null,
    };
  }
  if (record.kind === 'model.reply') {
    const parsed = replyFields.safeParse(fields);

    return { ...base, role: 'assistant', text: parsed.success ? parsed.data.text : null };
  }
  return { ...base, role: 'tool', text: fields === null ? null : JSON.stringify(fields) };
}

const spanFields = z.object({ start: z.int(), end: z.int(), source: z.string() });

const ownerFields = z.object({ text: z.string(), spans: z.array(spanFields).optional() });

const replyFields = z.object({ text: z.string() });

// a record's time can step back past a clock change, so each entry is checked against the range
function isInRange(entry: LogEntry, query: LogPageQuery): boolean {
  return (
    (query.from === null || entry.recordedAt >= query.from) &&
    (query.to === null || entry.recordedAt < query.to)
  );
}

// a forgotten entry holds no words, so a search never returns it
function hasEveryWord(entry: LogEntry, words: readonly string[]): boolean {
  if (words.length === 0) {
    return true;
  }
  if (entry.text === null) {
    return false;
  }
  const text = normalizeSearchText(entry.text);

  return words.every((word) => text.includes(word));
}

function normalizeSearchText(text: string): string {
  return text.normalize('NFKC').toLocaleLowerCase('en-US').trim();
}

// a long text is cut to textLimit characters
function toShownEntry(entry: LogEntry): LogEntry {
  if (entry.text === null || entry.text.length <= textLimit) {
    return entry;
  }
  return { ...entry, text: entry.text.slice(0, textLimit), isCut: true };
}
