import { createShortID } from '@heynixie/db';
import type { LogTables } from '@heynixie/log';
import { parseJSONObject, withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { conversationTaskID } from '@heynixie/tasks';
import { setWakeRuleInTransaction } from '@heynixie/triggers';
import type { Transaction } from 'kysely';
import { hashMessageID } from '../parse/hash-message-id';
import { mailSentCodec, mailSentFieldsSchema } from '../record/mail-sent-codec';
import type { MailContext, MailTables } from '../types';
import { readThreadShortID } from './read-thread-short-id';

export interface SentMailInput {
  readonly actionID: string;
  readonly hostMessageID: string;

  // the Message-ID of the send, without angle brackets
  readonly messageIDHeader: string;

  // the IDs that the mail answers, nearest first
  readonly references: readonly string[];

  // the thread of the mail that a reply answers
  readonly threadShortID: string | null;
  readonly to: readonly string[];
  readonly subject: string;
  readonly text: string;
  readonly sentAt: number;

  // the task that made the call: the conversation's or a task's ID
  readonly senderTaskID: string;

  // how long the reply rule stands; null registers none
  readonly replyExpiryMs: number | null;
}

export interface SentMail {
  readonly shortID: string;
  readonly threadShortID: string;
  readonly replyRuleShortID: string | null;
}

// Writes the record of a sent mail and its reply rule in one transaction, keyed by the host's ID of
// the sent mail, so the send's outcome and a reconcile that finds the mail write it once.
export function writeSentMail(context: MailContext, input: SentMailInput): Promise<SentMail> {
  return withWriteTransaction(context.log.writer, async (tx) => {
    const stored = await tx
      .$extendTables<MailTables>()
      .selectFrom('mail_messages')
      .selectAll()
      .where('host_message_id', '=', input.hostMessageID)
      .executeTakeFirst();

    if (stored !== undefined) {
      return readStoredSent(tx, stored);
    }

    const referenceHashes = input.references.map((id) => hashMessageID(id));

    const readThread = await readThreadShortID(tx, referenceHashes);

    const threadShortID = input.threadShortID ?? readThread;

    const rule =
      input.replyExpiryMs === null
        ? null
        : await setWakeRuleInTransaction(tx, context, {
            mailbox: { kind: 'mail' },
            match: { thread: threadShortID },
            target:
              input.senderTaskID === conversationTaskID
                ? { kind: 'conversation' }
                : { kind: 'task', taskID: input.senderTaskID },
            setBy: input.senderTaskID,
            expiresAt: input.sentAt + input.replyExpiryMs,
            windowMs: context.settings.wake.window,
            origin: 'reply',
            createdAt: input.sentAt,
          });

    const sent: SentMail = {
      shortID: createShortID(),
      threadShortID,
      replyRuleShortID: rule?.shortID ?? null,
    };

    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: mailSentCodec.kind,
        definitions: context.definitions(),
        payload: mailSentCodec.encode({
          messageID: crypto.randomUUID(),
          shortID: sent.shortID,
          threadShortID,
          hostMessageID: input.hostMessageID,
          actionID: input.actionID,
          sentAt: input.sentAt,
          headerHash: hashMessageID(input.messageIDHeader),
          referenceHashes,
          replyRuleShortID: sent.replyRuleShortID,
        }),
        erasable: mailSentFieldsSchema.parse({
          to: input.to,
          subject: input.subject,
          text: input.text,
          messageIDHeader: input.messageIDHeader,
          references: input.references,
        }),
      },
    ]);

    return sent;
  });
}

// Reads the sent mail again through the transaction, because the writer's one connection holds
// every other read until the transaction ends.
async function readStoredSent(
  tx: Transaction<unknown>,
  row: MailTables['mail_messages'],
): Promise<SentMail> {
  const record = await tx
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('payload')
    .where('sequence', '=', row.record_sequence)
    .executeTakeFirstOrThrow();

  return {
    shortID: row.short_id,
    threadShortID: row.thread_short_id,
    replyRuleShortID: mailSentCodec.decode(parseJSONObject(record.payload)).replyRuleShortID,
  };
}
