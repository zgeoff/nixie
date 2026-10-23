import type { Log, LogRecord, RecordKind } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { renderImageMarkers } from '@heynixie/sessions';
import { conversationTaskID, ownerMessageCodec } from '@heynixie/tasks';
import { z } from 'zod';
import { memoryWriterTaskID } from './memory-writer-task-id';
import type { SourceSpan } from './writer-types';

export interface BacklogEntry {
  readonly sequence: number;
  readonly role: 'owner' | 'assistant';

  readonly text: string | null;
  readonly spans: readonly SourceSpan[];

  readonly imageMarkers?: readonly string[];
  readonly recordedAt: number;
  readonly arrivedAt: number | null;

  readonly timeZone: string | null;
}

export interface BacklogRange {
  readonly after: number;

  readonly ownerLimit: number;

  readonly through: number | null;
}

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

// A type alias, because Kysely's table map needs the index signature that an interface lacks.
type WakeTables = Readonly<{
  records: { sequence: number; thread: string | null; kind: RecordKind; payload: string };
}>;

const wakePayload = z.object({ messageSequence: z.int(), at: z.int() });

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
      timeZone: ownerMessageCodec.tryDecodePartial(record.payload)?.timeZone ?? null,
    };
  }

  if (record.kind === 'model.reply') {
    const fields = parseFields(record, replyFields);

    return {
      ...base,
      role: 'assistant',
      text: fields?.text ?? null,
      spans: [],
      arrivedAt: null,
      timeZone: null,
    };
  }

  return null;
}

function parseFields<Fields>(record: LogRecord, schema: z.ZodType<Fields>): Fields | null {
  if (record.erasable.status !== 'readable') {
    return null;
  }

  const parsed = schema.safeParse(record.erasable.fields);

  return parsed.success ? parsed.data : null;
}
