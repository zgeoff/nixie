import { isWakeMatch } from '@heynixie/triggers';
import type { WakeMatch } from '@heynixie/triggers';
import type { PhoneContext, PhoneTables } from '../types';
import type { StoredTextFields } from './read-text-fields';
import { readTextFields } from './read-text-fields';

export interface TextQuery {
  // a number in E.164 form, or a sender name
  readonly from?: string;

  // epoch ms: only texts received at or after it
  readonly sinceMs?: number;

  // a wake rule's match, which the text must take
  readonly match?: WakeMatch;
  readonly limit: number;

  // the `next` of an earlier page
  readonly before?: string | null;
}

interface ListedText {
  readonly text: string;
  readonly from: string;
  readonly body: string;
  readonly at: string;

  // the sequence of the text's record, which orders texts that arrived in the same millisecond
  readonly sequence: number;
}

export interface TextPage {
  readonly texts: readonly ListedText[];
  readonly next: string | null;
}

const batchSize = 50;

// Pages through the stored texts, newest first. The filters read each text's fields, because the
// sender and the body sit in erasable fields that no index holds.
export async function readTextPage(context: PhoneContext, query: TextQuery): Promise<TextPage> {
  const texts: ListedText[] = [];
  let before = query.before ?? null;

  for (;;) {
    const rows = await readRows(context, before, query.sinceMs ?? null);

    if (rows.length === 0) {
      return { texts, next: null };
    }

    const fields = await readTextFields(context.log, rows);

    for (const row of rows) {
      const stored = fields.get(row.record_sequence);

      if (stored !== undefined && isWanted(query, stored)) {
        if (texts.length === query.limit) {
          return { texts, next: buildCursor(texts.at(-1)) };
        }

        texts.push(toListedText(row, stored));
      }
    }

    const last = rows.at(-1);

    if (rows.length < batchSize || last === undefined) {
      return { texts, next: null };
    }

    before = `${String(last.received_at)}:${String(last.record_sequence)}`;
  }
}

function readRows(
  context: PhoneContext,
  before: string | null,
  sinceMs: number | null,
): Promise<PhoneTables['phone_texts'][]> {
  const cursor = before === null ? null : before.split(':');
  const receivedAt = Number(cursor?.[0]);
  const sequence = Number(cursor?.[1]);

  return context.log.writer.db
    .$extendTables<PhoneTables>()
    .selectFrom('phone_texts')
    .selectAll()
    .$if(sinceMs !== null, (rows) => rows.where('received_at', '>=', sinceMs ?? 0))
    .$if(cursor !== null, (rows) =>
      rows.where((builder) =>
        builder.or([
          builder('received_at', '<', receivedAt),
          builder.and([
            builder('received_at', '=', receivedAt),
            builder('record_sequence', '<', sequence),
          ]),
        ]),
      ),
    )
    .orderBy('received_at', 'desc')
    .orderBy('record_sequence', 'desc')
    .limit(batchSize)
    .execute();
}

function isWanted(query: TextQuery, fields: StoredTextFields): boolean {
  const text = { from: fields.from, subject: '', threadID: '', body: fields.body };

  return (
    (query.from === undefined || isWakeMatch({ from: [query.from] }, text)) &&
    (query.match === undefined || isWakeMatch(query.match, text))
  );
}

function buildCursor(text: ListedText | undefined): string | null {
  return text === undefined ? null : `${String(Date.parse(text.at))}:${String(text.sequence)}`;
}

function toListedText(row: PhoneTables['phone_texts'], fields: StoredTextFields): ListedText {
  return {
    text: row.short_id,
    from: fields.from,
    body: fields.body,
    at: new Date(row.received_at).toISOString(),
    sequence: row.record_sequence,
  };
}
