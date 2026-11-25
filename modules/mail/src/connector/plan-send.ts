import { parseDuration } from '@heynixie/clock';
import { buildOutgoingMail } from '../parse/build-outgoing-mail';
import type { OutgoingDraft } from '../parse/build-outgoing-mail';
import { readMailFields } from '../store/read-mail-fields';
import { readMailRow } from '../store/read-mail-row';
import type { SentMailInput } from '../store/write-sent-mail';
import type { MailToolContext, OutgoingMail } from '../types';
import type { SendArguments } from './parse-send-arguments';
import { readActionTaskID } from './read-action-task-id';

export type SendPlan =
  | {
      readonly status: 'planned';
      readonly mail: OutgoingMail;

      // the Message-ID of the send, without angle brackets
      readonly messageIDHeader: string;

      // what the sent mail's record needs, once the host names the sent mail
      readonly toSentInput: (hostMessageID: string) => SentMailInput;
    }
  | { readonly status: 'refused'; readonly reason: string };

interface SendRequest {
  readonly actionID: string;
  readonly arguments: SendArguments;
}

// Plans one send from its arguments: the message, its Message-ID, which the action ID makes, and the
// record that its outcome writes. A retry or a reconcile of the action plans the same Message-ID.
export async function planSend(context: MailToolContext, request: SendRequest): Promise<SendPlan> {
  const senderTaskID = await readActionTaskID(context.log, request.actionID);

  if (senderTaskID === null) {
    return { status: 'refused', reason: `no action has the ID ${request.actionID}` };
  }

  const answer = await readAnswer(context, request.arguments);

  if (answer.status === 'refused') {
    return answer;
  }

  const sentAt = context.clock.now();
  const domain = context.settings.address.slice(context.settings.address.lastIndexOf('@') + 1);
  const messageIDHeader = `${request.actionID}@${domain}`;
  const to = request.arguments.kind === 'send' ? request.arguments.to : [answer.replyTo];

  const draft: OutgoingDraft = {
    messageID: messageIDHeader,
    from: context.settings.address,
    to,
    subject: answer.subject,
    text: request.arguments.text,
    references: answer.references,
    sentAt,
  };

  const replyExpiryMs =
    request.arguments.replyWake === 'off'
      ? null
      : (parseDuration(request.arguments.replyWake ?? '') ?? context.settings.wake.reply_expiry);

  return {
    status: 'planned',
    mail: buildOutgoingMail(draft),
    messageIDHeader,
    toSentInput: (hostMessageID) => ({
      actionID: request.actionID,
      hostMessageID,
      messageIDHeader,
      references: answer.references,
      threadShortID: answer.threadShortID,
      to,
      subject: answer.subject,
      text: request.arguments.text,
      sentAt,
      senderTaskID,
      replyExpiryMs,
    }),
  };
}

type Answer =
  | {
      readonly status: 'answered';
      readonly subject: string;
      readonly references: readonly string[];
      readonly threadShortID: string | null;
      readonly replyTo: string;
    }
  | { readonly status: 'refused'; readonly reason: string };

// What the mail being answered gives a send: nothing for a new mail, and for a reply its subject, its
// thread, the IDs it chains to and its sender.
async function readAnswer(context: MailToolContext, args: SendArguments): Promise<Answer> {
  if (args.kind === 'send') {
    return {
      status: 'answered',
      subject: args.subject,
      references: [],
      threadShortID: null,
      replyTo: '',
    };
  }

  const unknown: Answer = {
    status: 'refused',
    reason: `UNKNOWN_MESSAGE: no mail has the ID ${args.message}`,
  };

  const row = await readMailRow(context.log, args.message);

  if (row === null) {
    return unknown;
  }

  const stored = await readMailFields(context, [row]);

  const fields = stored.get(row.record_sequence);

  if (fields === undefined) {
    return unknown;
  }

  const chain = fields.messageIDHeader === '' ? [] : [fields.messageIDHeader, ...fields.references];

  return {
    status: 'answered',
    subject: /^re:/iu.test(fields.subject) ? fields.subject : `Re: ${fields.subject}`,
    references: chain,
    threadShortID: row.thread_short_id,
    replyTo: row.direction === 'in' ? fields.from : (fields.to[0] ?? ''),
  };
}
