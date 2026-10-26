import type { ContentSource, Log, LogRecord, RecordKind } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { renderOwnerText } from '@heynixie/sessions';
import { countBatchTokens } from './count-batch-tokens';
import type { MomentSpan } from './moment-types';

export interface MomentSpanQuery extends MomentSpan {
  readonly thread: string;

  // the sequence the page before ended at, or null for the first page
  readonly after: number | null;
  readonly tokenCap: number;
}

export interface MomentSpanEntry {
  readonly sequence: number;
  readonly kind: RecordKind;
  readonly recordedAt: number;

  // the record's source of content, or nixie for a record that holds only what nixie wrote
  readonly source: ContentSource | 'nixie';
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
      limit: batchSize,
    });

    if (batch.length === 0) {
      break;
    }

    for (const read of batch) {
      const entry = buildSpanEntry(read.record);
      const cost = countBatchTokens(JSON.stringify(entry));

      if (entries.length > 0 && tokens + cost > query.tokenCap) {
        return { entries, next: after };
      }

      const shown = cost > query.tokenCap ? cutSpanEntry(entry, query.tokenCap) : entry;

      entries.push(shown);

      tokens += cost;
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

// One record larger than a page still reaches the reader, cut to the page's size.
function cutSpanEntry(entry: MomentSpanEntry, tokenCap: number): MomentSpanEntry {
  const text = entry.text;

  if (text === null) {
    return entry;
  }

  return { ...entry, text: text.slice(0, tokenCap * 4), isCut: true };
}
