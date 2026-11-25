import { parseDuration } from '@heynixie/clock';
import { maxWakeDurationMs, minWakeDurationMs } from '@heynixie/triggers';
import { buildOutgoingMail } from '../parse/build-outgoing-mail';
import type { OutgoingDraft } from '../parse/build-outgoing-mail';
import { readMailFields } from '../store/read-mail-fields';
import { readMailRow } from '../store/read-mail-row';
import type { SentMailInput } from '../store/write-sent-mail';
import type { MailToolContext, OutgoingMail } from '../types';
import { buildSendMessageID } from './build-send-message-id';
import type { SendArguments } from './parse-send-arguments';
import { readActionFacts } from './read-action-facts';
import type { SendFile, SendFileContent } from './read-send-files';
import { readSendFileContents, readSendFiles } from './read-send-files';

export type SendPlan =
  | {
      readonly status: 'planned';

      // null in a reconcile, which sends nothing
      readonly mail: OutgoingMail | null;

      // the Message-ID of the send, without angle brackets
      readonly messageIDHeader: string;

      // what the sent mail's record needs, once the host names the sent mail
      readonly toSentInput: (hostMessageID: string) => SentMailInput;
    }
  | { readonly status: 'refused'; readonly reason: string };

interface SendRequest {
  readonly actionID: string;
  readonly arguments: SendArguments;

  // true when the plan only records a send that the host has already, so a reply whose original mail
  // was forgotten since still gets its record
  readonly isReconcile: boolean;
}

// Plans one send from its arguments: the message, its Message-ID, which the action ID makes, and the
// record that its outcome writes. A retry or a reconcile of the action plans the same Message-ID and
// the same send time, which is the time of the action's first attempt.
export async function planSend(context: MailToolContext, request: SendRequest): Promise<SendPlan> {
  const facts = await readActionFacts(context.log, request.actionID);

  if (facts === null) {
    return { status: 'refused', reason: `no action has the ID ${request.actionID}` };
  }

  const answer = await readAnswer(context, request);

  if (answer.status === 'refused') {
    return answer;
  }

  const files = await readFiles(context, request, facts.thread);

  if (files.status === 'refused') {
    return files;
  }

  const sentAt = facts.firstAttemptAt ?? context.clock.now();
  const messageIDHeader = buildSendMessageID(context.settings, request.actionID);
  const to = request.arguments.kind === 'send' ? request.arguments.to : [answer.replyTo];

  const draft: OutgoingDraft = {
    messageID: messageIDHeader,
    from: context.settings.address,
    to,
    subject: answer.subject,
    text: request.arguments.text,
    references: answer.references,
    files: files.contents,
    sentAt,
  };

  const replyExpiryMs =
    request.arguments.replyWake === 'off'
      ? null
      : (parseDuration(request.arguments.replyWake ?? '') ?? context.settings.wake.reply_expiry);

  if (
    replyExpiryMs !== null &&
    (replyExpiryMs < minWakeDurationMs || replyExpiryMs > maxWakeDurationMs)
  ) {
    return {
      status: 'refused',
      reason: 'BAD_DURATION: the reply wake runs from 1m to 3650d',
    };
  }

  const mail = request.isReconcile ? null : buildOutgoingMail(draft);

  if (mail === null && !request.isReconcile) {
    return {
      status: 'refused',
      reason: 'BAD_ADDRESS: an address or an ID of the send is not printable ASCII',
    };
  }

  return {
    status: 'planned',
    mail,
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
      attachments: files.listed.map((file) => ({ name: file.name, bytes: file.bytes })),
      sentAt,
      senderTaskID: facts.taskID,
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
// thread, the IDs it chains to and its sender. A reconcile of a reply whose mail was forgotten keeps
// the mail's thread and nothing else of it.
async function readAnswer(context: MailToolContext, request: SendRequest): Promise<Answer> {
  const args = request.arguments;

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
    return request.isReconcile
      ? { status: 'answered', subject: '', references: [], threadShortID: null, replyTo: '' }
      : unknown;
  }

  const stored = await readMailFields(context, [row]);

  const fields = stored.get(row.record_sequence);

  if (fields === undefined) {
    return request.isReconcile
      ? {
          status: 'answered',
          subject: '',
          references: [],
          threadShortID: row.thread_short_id,
          replyTo: '',
        }
      : unknown;
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

type Files =
  | {
      readonly status: 'read';
      readonly listed: readonly SendFile[];

      // the bytes of each file, none in a reconcile, which sends nothing
      readonly contents: readonly SendFileContent[];
    }
  | { readonly status: 'refused'; readonly reason: string };

// The files of a send. A send that runs needs each one's bytes, and refuses when one is gone. A
// reconcile of a send that went out only lists the files it can still name, because the mail is
// already out.
async function readFiles(
  context: MailToolContext,
  request: SendRequest,
  thread: string,
): Promise<Files> {
  if (request.isReconcile) {
    const named = await readSendFiles(context.ports, thread, request.arguments.files);

    return { status: 'read', listed: named.status === 'ok' ? named.files : [], contents: [] };
  }

  const read = await readSendFileContents(context.ports, thread, request.arguments.files);

  return read.status === 'ok'
    ? { status: 'read', listed: read.files, contents: read.files }
    : { status: 'refused', reason: read.message };
}
