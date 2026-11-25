import { readRecords } from '@heynixie/log';
import { mailReceivedFieldsSchema } from '../record/mail-received-codec';
import { mailSentFieldsSchema } from '../record/mail-sent-codec';
import type { MailContext, MailTables, StoredMailFields } from '../types';

type MailRow = MailTables['mail_messages'];

// The text of each stored mail by the sequence of its record. A mail whose fields were forgotten has
// none.
export async function readMailFields(
  context: Pick<MailContext, 'log' | 'settings'>,
  rows: readonly MailRow[],
): Promise<ReadonlyMap<number, StoredMailFields>> {
  const fields = new Map<number, StoredMailFields>();

  if (rows.length === 0) {
    return fields;
  }

  const records = await readRecords(context.log, {
    afterSequence: 0,
    sequences: rows.map((row) => row.record_sequence),
    limit: rows.length,
  });

  for (const entry of records) {
    const erasable = entry.record.erasable;

    if (erasable.status !== 'readable') {
      continue;
    }

    if (entry.record.kind === 'mail.received') {
      fields.set(entry.record.sequence, mailReceivedFieldsSchema.parse(erasable.fields));
    } else if (entry.record.kind === 'mail.sent') {
      const sent = mailSentFieldsSchema.parse(erasable.fields);

      fields.set(entry.record.sequence, {
        from: context.settings.address,
        to: sent.to,
        cc: [],
        subject: sent.subject,
        text: sent.text,
        attachments: [],
        messageIDHeader: sent.messageIDHeader,
        references: sent.references,
      });
    }
  }

  return fields;
}
