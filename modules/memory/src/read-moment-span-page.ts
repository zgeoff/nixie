import type { ContentSource, JSONObject, Log, LogRecord, RecordKind } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { renderOwnerText } from '@heynixie/sessions';
import { conversationKinds } from './conversation-kinds';
import { countBatchTokens } from './count-batch-tokens';
import type { MomentSpan } from './moment-types';

export type MomentSpanRecords = 'conversation' | 'all';

export interface MomentSpanQuery extends MomentSpan {
  readonly thread: string;

  // the sequence the page before ended at, or null for the first page
  readonly after: number | null;
  readonly tokenCap: number;
  readonly records: MomentSpanRecords;
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

  // the record's text is gone, so the moment shows a gap
  readonly isGap: boolean;
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

    for (const read of batch) {
      const entry = buildSpanEntry(read.record);
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

function buildSpanEntry(record: LogRecord): MomentSpanEntry {
  const erasable = record.erasable;
  const isGap = erasable.status === 'shredded' || erasable.status === 'unreadable';

  return {
    sequence: record.sequence,
    kind: record.kind,
    recordedAt: record.recordedAt.getTime(),
    source: record.contentSource ?? 'nixie',
    payload: Object.keys(record.payload).length === 0 ? null : record.payload,
    decision: record.decision?.outcome ?? null,
    text: erasable.status === 'readable' ? renderRecordText(record, erasable.fields) : null,
    isGap,
    isCut: false,
  };
}

function renderRecordText(record: LogRecord, fields: Readonly<Record<string, unknown>>): string {
  if (record.kind === 'owner_message') {
    return renderOwnerText(record);
  }

  const text = fields['text'];

  return record.kind === 'model.reply' && typeof text === 'string' ? text : JSON.stringify(fields);
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
