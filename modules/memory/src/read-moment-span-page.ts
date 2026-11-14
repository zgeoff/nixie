import type {
  ContentSource,
  JSONObject,
  Log,
  LogRecord,
  RecordKind,
  RecordWithChanges,
} from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { renderOwnerText } from '@heynixie/sessions';
import type { OwnerImageMediaType } from '@heynixie/tasks';
import { ownerMessageCodec } from '@heynixie/tasks';
import { conversationKinds } from './conversation-kinds';
import { countBatchTokens } from './count-batch-tokens';
import { formatToolEntry } from './format-tool-entry';
import type { MomentSpan } from './moment-context';
import { readRemovedSequences } from './read-removed-sequences';
import { readToolShortIDs } from './read-tool-short-ids';
import type { ShortIDLookup } from './swapped-keys';

export type MomentSpanRecords = 'conversation' | 'all';

export interface MomentSpanQuery extends MomentSpan {
  readonly thread: string;

  // the sequence the page before ended at, or null for the first page
  readonly after: number | null;
  readonly tokenCap: number;
  readonly records: MomentSpanRecords;

  // the model reads a tool result as its result or message alone, and the owner's export keeps
  // every field
  readonly reader: 'model' | 'owner';
}

export interface MomentSpanImage {
  // the image's place in its message, counted from 1
  // oxlint-disable-next-line id-length -- the pointer's field is n, as the number input of log.read_image names it
  readonly n: number;
  readonly mediaType: OwnerImageMediaType;
}

export interface MomentSpanEntry {
  readonly sequence: number;
  readonly kind: RecordKind;
  readonly recordedAt: number;

  // the record's source of content, or nixie for a record that holds only what nixie wrote
  readonly source: ContentSource | 'nixie';

  // the record's payload, such as a called tool's name or an outcome, and its policy decision
  readonly payload: JSONObject | null;
  readonly decision: 'allow' | 'ask' | 'deny' | null;
  readonly text: string | null;

  // a pointer to each image of a readable owner message, read from its payload alone
  readonly images: readonly MomentSpanImage[];

  // the record's text is gone, so the moment shows a gap
  readonly isGap: boolean;

  // the record's key is gone because a forget removed the record, not because a session cleanup
  // deleted it. A record whose key fails to decrypt is a gap and is not removed.
  readonly isRemoved: boolean;
  readonly isCut: boolean;
}

export interface MomentSpanPage {
  readonly entries: readonly MomentSpanEntry[];
  readonly next: number | null;
}

const batchSize = 50;

export async function readMomentSpanPage(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  query: MomentSpanQuery,
): Promise<MomentSpanPage> {
  const entries: MomentSpanEntry[] = [];
  let after = Math.max(query.after ?? 0, query.firstSequence - 1);
  let tokens = 0;

  while (after < query.lastSequence) {
    const batch = await readRecords(log, {
      afterSequence: after,
      beforeSequence: query.lastSequence + 1,
      thread: query.thread,
      ...(query.records === 'conversation' ? { kinds: conversationKinds } : {}),
      limit: batchSize,
    });

    if (batch.length === 0) {
      break;
    }

    const removed = await readRemovedSequences(
      log.writer.db,
      batch
        .filter((read) => read.record.erasable.status === 'shredded')
        .map((read) => read.record.sequence),
    );

    const lookup = await readBatchShortIDs(log, batch, query.reader);

    for (const read of batch) {
      const entry = buildSpanEntry(read.record, removed, { reader: query.reader, lookup });
      const cost = countEntryTokens(entry);

      if (entries.length > 0 && tokens + cost > query.tokenCap) {
        return { entries, next: after };
      }

      const shown = cost > query.tokenCap ? cutSpanEntry(entry, query.tokenCap) : entry;

      entries.push(shown);

      tokens += countEntryTokens(shown);
      after = read.record.sequence;
    }
  }

  return { entries, next: null };
}

const emptyLookup: ShortIDLookup = { moment: new Map(), item: new Map(), change: new Map() };

// The owner's export keeps every field as stored, so it reads no short ID.
function readBatchShortIDs(
  log: Pick<Log, 'writer'>,
  batch: readonly RecordWithChanges[],
  reader: 'model' | 'owner',
): Promise<ShortIDLookup> {
  if (reader === 'owner') {
    return Promise.resolve(emptyLookup);
  }

  return readToolShortIDs(
    log,
    batch.map((read) => read.record),
  );
}

interface SpanRender {
  readonly reader: 'model' | 'owner';
  readonly lookup: ShortIDLookup;
}

function buildSpanEntry(
  record: LogRecord,
  removed: ReadonlySet<number>,
  render: SpanRender,
): MomentSpanEntry {
  const erasable = record.erasable;
  const isGap = erasable.status === 'shredded' || erasable.status === 'unreadable';

  return {
    sequence: record.sequence,
    kind: record.kind,
    recordedAt: record.recordedAt.getTime(),
    source: record.contentSource ?? 'nixie',
    payload: Object.keys(record.payload).length === 0 ? null : record.payload,
    decision: record.decision?.outcome ?? null,
    text: erasable.status === 'readable' ? renderRecordText(record, erasable.fields, render) : null,
    images: erasable.status === 'readable' ? collectSpanImages(record) : [],
    isGap,
    isRemoved: erasable.status === 'shredded' && removed.has(record.sequence),
    isCut: false,
  };
}

function renderRecordText(
  record: LogRecord,
  fields: Readonly<Record<string, unknown>>,
  render: SpanRender,
): string {
  if (record.kind === 'owner_message') {
    return renderOwnerText(record);
  }

  if (record.kind === 'tool_result' && render.reader === 'model') {
    return formatToolEntry(record, fields, render.lookup);
  }

  const text = fields['text'];

  return record.kind === 'model.reply' && typeof text === 'string' ? text : JSON.stringify(fields);
}

function collectSpanImages(record: LogRecord): MomentSpanImage[] {
  if (record.kind !== 'owner_message') {
    return [];
  }

  const images = ownerMessageCodec.tryDecodePartial(record.payload)?.images ?? [];

  // oxlint-disable-next-line id-length -- the pointer's field is n, as the number input of log.read_image names it
  return images.map((image, index) => ({ n: index + 1, mediaType: image.mediaType }));
}

// The reader's form of an entry adds an event ID, a written-out time and a separator, which the
// entry's own size leaves out.
const entryOverhead = 8;

function countEntryTokens(entry: MomentSpanEntry): number {
  return countBatchTokens(JSON.stringify(entry)) + entryOverhead;
}

// One record larger than a page still reaches the reader, its text cut until the whole entry, as
// the reader receives it, fits the page. A payload that alone outgrows the page is left out.
function cutSpanEntry(entry: MomentSpanEntry, tokenCap: number): MomentSpanEntry {
  const text = entry.text;
  const bare = { ...entry, text: text === null ? null : '', isCut: true };
  const base = countEntryTokens(bare) <= tokenCap ? entry : { ...entry, payload: null };

  if (text === null) {
    return { ...base, isCut: true };
  }

  let low = 0;
  let high = text.length;

  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const cut = { ...base, text: text.slice(0, middle), isCut: true };

    if (countEntryTokens(cut) <= tokenCap) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }

  return { ...base, text: text.slice(0, low), isCut: true };
}
