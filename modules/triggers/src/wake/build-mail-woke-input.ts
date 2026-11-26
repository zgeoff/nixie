import type { RecordInput } from '@heynixie/log';
import { triggerMailWokeCodec } from '@heynixie/tasks';
import { wakeMatchSchema } from '../record/wake-match-schema';
import type { Mailbox, TriggerCoreContext, WakeRule } from '../types';
import { buildMailboxKey } from './build-mailbox-key';

export interface WokeMail {
  // the sequence of the mail's arrival record
  readonly arrived: number;
  readonly messageID: string;
  readonly threadID: string;
  readonly receivedAt: number;
  readonly from: string;
  readonly subject: string;
}

export interface MailWake {
  readonly targetTaskID: string;
  readonly mailbox: Mailbox;
  readonly rules: readonly WakeRule[];

  // oldest first
  readonly mails: readonly WokeMail[];
}

// The inbox record of one wake. The sender and the subject of each mail go in its erasable fields.
export function buildMailWokeInput(
  core: Pick<TriggerCoreContext, 'definitions'>,
  wake: MailWake,
): RecordInput {
  return {
    kind: triggerMailWokeCodec.kind,
    definitions: core.definitions(),
    thread: wake.targetTaskID,
    contentSource: 'untrusted',
    payload: triggerMailWokeCodec.encode({
      taskID: wake.targetTaskID,
      mailbox: buildMailboxKey(wake.mailbox),
      rules: wake.rules.map((rule) => ({
        ruleID: rule.ruleID,
        shortID: rule.shortID,
        match: wakeMatchSchema.parse(rule.match),
        expiresAt: rule.expiresAt,
      })),
      mails: wake.mails.map((mail) => ({
        arrived: mail.arrived,
        messageID: mail.messageID,
        threadID: mail.threadID,
        receivedAt: mail.receivedAt,
      })),
    }),
    erasable: {
      mails: wake.mails.map((mail) => ({
        arrived: mail.arrived,
        from: mail.from,
        subject: mail.subject,
      })),
    },
  };
}
