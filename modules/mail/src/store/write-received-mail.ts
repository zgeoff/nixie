import { createShortID } from '@heynixie/db';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { hashMessageID } from '../parse/hash-message-id';
import { mailReceivedCodec, mailReceivedFieldsSchema } from '../record/mail-received-codec';
import type { HostMail, MailContext, MailTables, ParsedMail } from '../types';
import { countStoredAttachments } from './count-stored-attachments';
import { readThreadShortID } from './read-thread-short-id';

export interface ReceivedMail {
  readonly shortID: string;
  readonly threadShortID: string;
}

// Stores one host mail in a write transaction of its own. A host mail that nixie stored already
// changes nothing, because its host ID is unique, so a redelivery after a crash stores no copy.
export function writeReceivedMail(
  context: MailContext,
  host: HostMail,
  parsed: ParsedMail,
): Promise<ReceivedMail> {
  return withWriteTransaction(context.log.writer, async (tx) => {
    const stored = await tx
      .$extendTables<MailTables>()
      .selectFrom('mail_messages')
      .select(['short_id', 'thread_short_id'])
      .where('host_message_id', '=', host.hostMessageID)
      .executeTakeFirst();

    if (stored !== undefined) {
      return { shortID: stored.short_id, threadShortID: stored.thread_short_id };
    }

    const referenceHashes = parsed.references.map((id) => hashMessageID(id));

    const threadShortID = await readThreadShortID(tx, referenceHashes);

    const storedCount = countStoredAttachments(
      parsed.attachments.map((attachment) => attachment.bytes),
    );

    const shortID = createShortID();
    const headerHash = hashMessageID(parsed.messageID ?? `host:${host.hostMessageID}`);

    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: mailReceivedCodec.kind,
        definitions: context.definitions(),
        payload: mailReceivedCodec.encode({
          messageID: crypto.randomUUID(),
          shortID,
          threadShortID,
          hostMessageID: host.hostMessageID,
          receivedAt: host.receivedAt,
          headerHash,
          referenceHashes,
        }),
        erasable: mailReceivedFieldsSchema.parse({
          from: parsed.from,
          to: parsed.to,
          cc: parsed.cc,
          subject: parsed.subject,
          text: parsed.text,
          html: parsed.html,
          attachments: parsed.attachments.map((attachment, index) => ({
            ...attachment,
            isStored: index < storedCount,
          })),
          messageIDHeader: parsed.messageID ?? '',
          references: parsed.references,
        }),
        attachments: parsed.attachmentContents.slice(0, storedCount),
      },
    ]);

    return { shortID, threadShortID };
  });
}
