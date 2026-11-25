import { isWakeMatch } from '@heynixie/triggers';
import type { WakeMatch } from '@heynixie/triggers';
import type { MailContext, MailTables, StoredMailFields } from '../types';
import { readMailFields } from './read-mail-fields';

export interface MailQuery {
  // an address, or '@domain'
  readonly from?: string;

  // a substring of the subject, the text or the source of an HTML body
  readonly text?: string;
  readonly isUnread?: boolean;

  // epoch ms: only mail received at or after it
  readonly sinceMs?: number;

  // a wake rule's match, which the mail must take
  readonly match?: WakeMatch;
  readonly limit: number;

  // the `next` of an earlier page
  readonly before?: string | null;
}

interface ListedMail {
  readonly message: string;
  readonly thread: string;
  readonly from: string;
  readonly subject: string;
  readonly at: string;
  readonly unread: boolean;

  // the sequence of the mail's record, which orders mail that arrived in the same millisecond
  readonly sequence: number;
}

export interface MailPage {
  readonly mails: readonly ListedMail[];
  readonly next: string | null;
}

const batchSize = 50;

// Pages through the stored mail that the assistant received, newest first. The filters read the
// text of each mail, because the text sits in erasable fields that no index holds.
export async function readMailPage(context: MailContext, query: MailQuery): Promise<MailPage> {
  const mails: ListedMail[] = [];
  let before = query.before ?? null;

  for (;;) {
    const rows = await readRows(context, before, query.sinceMs ?? null);

    if (rows.length === 0) {
      return { mails, next: null };
    }

    const fields = await readMailFields(context, rows);

    for (const row of rows) {
      const stored = fields.get(row.record_sequence);

      if (stored !== undefined && isWanted(query, row, stored)) {
        if (mails.length === query.limit) {
          return { mails, next: buildCursor(mails.at(-1)) };
        }

        mails.push(toListedMail(row, stored));
      }
    }

    const last = rows.at(-1);

    if (rows.length < batchSize || last === undefined) {
      return { mails, next: null };
    }

    before = `${String(last.received_at)}:${String(last.record_sequence)}`;
  }
}

function readRows(
  context: MailContext,
  before: string | null,
  sinceMs: number | null,
): Promise<MailTables['mail_messages'][]> {
  const cursor = before === null ? null : before.split(':');
  const receivedAt = Number(cursor?.[0]);
  const sequence = Number(cursor?.[1]);

  return context.log.writer.db
    .$extendTables<MailTables>()
    .selectFrom('mail_messages')
    .selectAll()
    .where('direction', '=', 'in')
    .$if(sinceMs !== null, (query) => query.where('received_at', '>=', sinceMs ?? 0))
    .$if(cursor !== null, (query) =>
      query.where((builder) =>
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

function isWanted(
  query: MailQuery,
  row: MailTables['mail_messages'],
  fields: StoredMailFields,
): boolean {
  const mail = { from: fields.from, subject: fields.subject, threadID: row.thread_short_id };
  const text = query.text?.toLowerCase();

  return (
    (query.isUnread !== true || row.unread === 1) &&
    (query.from === undefined || isWakeMatch({ from: [query.from] }, mail)) &&
    (text === undefined ||
      fields.subject.toLowerCase().includes(text) ||
      fields.text.toLowerCase().includes(text) ||
      fields.html.toLowerCase().includes(text)) &&
    (query.match === undefined || isWakeMatch(query.match, mail))
  );
}

function buildCursor(mail: ListedMail | undefined): string | null {
  return mail === undefined ? null : `${String(Date.parse(mail.at))}:${String(mail.sequence)}`;
}

function toListedMail(row: MailTables['mail_messages'], fields: StoredMailFields): ListedMail {
  return {
    message: row.short_id,
    thread: row.thread_short_id,
    from: fields.from,
    subject: fields.subject,
    at: new Date(row.received_at).toISOString(),
    unread: row.unread === 1,
    sequence: row.record_sequence,
  };
}
