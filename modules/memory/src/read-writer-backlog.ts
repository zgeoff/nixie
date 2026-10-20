import type { Log, LogRecord, RecordKind } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { renderImageMarkers } from '@heynixie/sessions';
import { conversationTaskID } from '@heynixie/tasks';
import { z } from 'zod';
import { memoryWriterTaskID } from './memory-writer-task-id';
import type { SourceSpan } from './writer-types';

// One conversation record after the writer's cursor: your message or a reply, with its text when
// it is still readable, and the time the writer's wake recorded for your message's arrival.
export interface BacklogEntry {
  readonly sequence: number;
  readonly role: 'owner' | 'assistant';

  // null once the record's text is forgotten, so it can never be evidence
  readonly text: string | null;
  readonly spans: readonly SourceSpan[];

  // a marker line for each image of your message, and never the image's bytes; a reply has none
  readonly imageMarkers?: readonly string[];
  readonly recordedAt: number;
  readonly arrivedAt: number | null;
}

export interface BacklogRange {
  readonly after: number;

  // stops once the backlog holds more of your messages than this
  readonly ownerLimit: number;

  // the last sequence to read, or null to read to the end
  readonly through: number | null;
}

// Reads your messages and the replies after a sequence, oldest first, until the backlog holds more
// of your messages than the limit, passes the last sequence, or reaches the end, so the planner
// sees every reply of the last message a batch can take.
export async function readWriterBacklog(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  range: BacklogRange,
): Promise<readonly BacklogEntry[]> {
  const arrivals = await readArrivals(log, range.after);
  const records = await readConversationRecords(log, range);

  return records.flatMap((record) => {
    const entry = toBacklogEntry(record, arrivals);

    return entry === null ? [] : [entry];
  });
}

// mapped types, because Kysely's table map needs the index signature an interface lacks
type WakeTables = Readonly<{
  records: { sequence: number; thread: string | null; kind: RecordKind; payload: string };
}>;

const wakePayload = z.object({ messageSequence: z.int(), at: z.int() });

// the clock time each of your messages arrived, from the first wake the writer recorded for it
async function readArrivals(
  log: Pick<Log, 'writer'>,
  cursor: number,
): Promise<ReadonlyMap<number, number>> {
  const rows = await log.writer.db
    .$extendTables<WakeTables>()
    .selectFrom('records')
    .select('payload')
    .where('thread', '=', memoryWriterTaskID)
    .where('kind', '=', 'task.wake')
    .where('sequence', '>', cursor)
    .orderBy('sequence', 'desc')
    .execute();

  const wakes = rows.flatMap((row) => {
    const payload: unknown = JSON.parse(row.payload);
    const wake = wakePayload.safeParse(payload);

    return wake.success ? [[wake.data.messageSequence, wake.data.at] as const] : [];
  });

  // the rows run newest first, so each message keeps the time of its first wake
  return new Map(wakes);
}

const pageSize = 100;

async function readConversationRecords(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  range: BacklogRange,
): Promise<readonly LogRecord[]> {
  const collected: LogRecord[] = [];
  const page = { after: range.after, isDone: false };

  while (!page.isDone) {
    const entries = await readRecords(log, {
      afterSequence: page.after,
      thread: conversationTaskID,
      limit: pageSize,
    });

    const inRange = entries
      .map((entry) => entry.record)
      .filter((record) => range.through === null || record.sequence <= range.through);

    collected.push(...inRange);

    page.isDone =
      entries.length < pageSize ||
      inRange.length < entries.length ||
      countOwnerMessages(collected) > range.ownerLimit;

    page.after = entries.at(-1)?.record.sequence ?? page.after;
  }

  return collected;
}

function countOwnerMessages(records: readonly LogRecord[]): number {
  return records.filter((record) => record.kind === 'owner_message').length;
}

const spanFields = z.object({ start: z.int(), end: z.int(), source: z.string() });
const ownerFields = z.object({ text: z.string(), spans: z.array(spanFields).optional() });
const replyFields = z.object({ text: z.string() });

function toBacklogEntry(
  record: LogRecord,
  arrivals: ReadonlyMap<number, number>,
): BacklogEntry | null {
  const base = { sequence: record.sequence, recordedAt: record.recordedAt.getTime() };

  if (record.kind === 'owner_message') {
    const fields = parseFields(record, ownerFields);

    return {
      ...base,
      role: 'owner',
      text: fields?.text ?? null,
      spans: fields?.spans ?? [],
      imageMarkers: renderImageMarkers(record),
      arrivedAt: arrivals.get(record.sequence) ?? null,
    };
  }

  if (record.kind === 'model.reply') {
    const fields = parseFields(record, replyFields);

    return { ...base, role: 'assistant', text: fields?.text ?? null, spans: [], arrivedAt: null };
  }

  return null;
}

// a record's erasable fields in their shape, or null once they are forgotten or unreadable
function parseFields<Fields>(record: LogRecord, schema: z.ZodType<Fields>): Fields | null {
  if (record.erasable.status !== 'readable') {
    return null;
  }

  const parsed = schema.safeParse(record.erasable.fields);

  return parsed.success ? parsed.data : null;
}
