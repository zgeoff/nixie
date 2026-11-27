import type { ActionAttempt, ConnectorContext, ProviderResponse } from '@heynixie/connections';
import { buildDraftDigest } from './build-draft-digest';
import { buildRawMail } from './build-raw-mail';
import type { RawMailFile } from './build-raw-mail';
import { buildSendMessageID } from './build-send-message-id';
import { collectAddresses } from './collect-addresses';
import { gmailToolNames } from './gmail-tool-names';
import { normalizeAddresses } from './normalize-addresses';
import { parseItemID } from './parse-item-id';
import { planReply } from './plan-reply';
import { readActionFacts } from './read-action-facts';
import { readGmailDraft } from './read-gmail-draft';
import { readGmailMessage } from './read-gmail-message';
import { readGmailRaw } from './read-gmail-raw';
import { readSendFiles } from './read-send-files';
import {
  replyArgumentsSchema,
  sendArgumentsSchema,
  sendDraftArgumentsSchema,
} from './send-arguments-schema';
import type { GmailDeps } from './types';

export type OutgoingPlan =
  | {
      readonly kind: 'ready';

      // the base64url MIME message
      readonly raw: string;
      readonly threadID: string | null;

      // the draft that a sent draft leaves behind, which the attempt removes
      readonly draftID: string | null;
    }
  | { readonly kind: 'response'; readonly response: ProviderResponse };

export type OutgoingTool =
  | typeof gmailToolNames.send
  | typeof gmailToolNames.draft
  | typeof gmailToolNames.reply
  | typeof gmailToolNames.sendDraft;

interface OutgoingRequest {
  readonly tool: OutgoingTool;
  readonly attempt: ActionAttempt;
}

// Reads what a send needs from Google and the queue as the attempt begins, and builds its MIME
// message. A reply or a sent draft whose recipients differ from the ones the policy checked comes
// back as `destinations_changed`, and nothing goes out.
export async function planOutgoingMail(
  deps: GmailDeps,
  context: ConnectorContext,
  request: OutgoingRequest,
): Promise<OutgoingPlan> {
  const attempt = request.attempt;

  const queued = await readActionFacts(deps.log, attempt.actionID);

  const facts = queued ?? { thread: '', firstAttemptAt: null };

  const base = {
    messageID: buildSendMessageID(context.account, attempt.actionID),
    from: context.account,
    sentAtMs: facts.firstAttemptAt ?? deps.clock.now(),
  };

  if (request.tool === gmailToolNames.sendDraft) {
    return planSentDraft(deps, context, { attempt, messageID: base.messageID });
  }

  if (request.tool === gmailToolNames.reply) {
    return planReplyMail(deps, context, { attempt, base, thread: facts.thread });
  }

  const parsed = sendArgumentsSchema.safeParse(attempt.arguments);

  if (!parsed.success) {
    return refuse('the arguments of the mail are unreadable');
  }

  const files = await readRawFiles(deps, facts.thread, parsed.data.files ?? []);

  if (files.kind === 'response') {
    return files;
  }

  return {
    kind: 'ready',
    raw: buildRawMail({
      ...base,
      to: parsed.data.to,
      cc: parsed.data.cc ?? [],
      bcc: parsed.data.bcc ?? [],
      subject: parsed.data.subject,
      text: parsed.data.text,
      html: parsed.data.html ?? null,
      files: files.files,
      inReplyTo: null,
      references: [],
    }),
    threadID: null,
    draftID: null,
  };
}

interface DraftRequest {
  readonly attempt: ActionAttempt;
  readonly messageID: string;
}

// A draft sends as the message that it holds, with the action's Message-ID in place of its own, so
// the Sent-folder check finds it.
async function planSentDraft(
  deps: GmailDeps,
  context: ConnectorContext,
  request: DraftRequest,
): Promise<OutgoingPlan> {
  const parsed = sendDraftArgumentsSchema.safeParse(request.attempt.arguments);
  const draftText = parsed.success ? parsed.data.draft : '';
  const item = parseItemID(draftText);

  if (!parsed.success || item === null) {
    return refuse('the arguments of the send are unreadable');
  }

  const read = await readGmailDraft(deps.hosts, context, item.id);

  if (read.kind !== 'draft') {
    return read.kind === 'missing'
      ? refuse(`UNKNOWN_DRAFT: the draft ${parsed.data.draft} is gone`)
      : failRead(read.reason);
  }

  const headers = read.message.payload.headers;

  const recipients = [
    ...collectAddresses(headers.get('to')),
    ...collectAddresses(headers.get('cc')),
    ...collectAddresses(headers.get('bcc')),
  ];

  if (!isSameSet(recipients, request.attempt.destinations)) {
    return {
      kind: 'response',
      response: {
        kind: 'destinations_changed',
        reason: 'the recipients of the draft differ from the ones that were checked',
      },
    };
  }

  const raw = await readGmailRaw(deps.hosts, context, read.message.id);

  if (raw.kind === 'failed') {
    return failRead(raw.reason);
  }

  if (buildDraftDigest(raw.text) !== parsed.data.digest) {
    return refuse('CHANGED: the draft changed after it was checked, and nothing was sent');
  }

  return {
    kind: 'ready',
    raw: replaceMessageID(Buffer.from(raw.text, 'base64url').toString('utf8'), request.messageID),
    threadID: read.message.threadID,
    draftID: item.id,
  };
}

function refuse(reason: string): OutgoingPlan {
  return { kind: 'response', response: { kind: 'refused', reason } };
}

function failRead(reason: string): OutgoingPlan {
  return {
    kind: 'response',
    response: { kind: 'refused_retryable', reason: `GMAIL_FAILED: ${reason}` },
  };
}

function isSameSet(left: readonly string[], right: readonly string[]): boolean {
  const sortedLeft = [...new Set(normalizeAddresses(left))].toSorted();
  const sortedRight = [...new Set(normalizeAddresses(right))].toSorted();

  return JSON.stringify(sortedLeft) === JSON.stringify(sortedRight);
}

// Swaps the Message-ID header, with its folded lines, for the action's.
function replaceMessageID(message: string, messageID: string): string {
  const [head = '', ...rest] = message.split(/\r?\n\r?\n/u);
  const kept = head.replaceAll(/^message-id:[^\r\n]*(?:\r?\n[ \t][^\r\n]*)*\r?\n?/gimu, '');
  const headers = `${kept.replace(/\s+$/u, '')}\r\nMessage-ID: <${messageID}>`;

  return Buffer.from([headers, ...rest].join('\r\n\r\n'), 'utf8').toString('base64url');
}

interface ReplyRequest {
  readonly attempt: ActionAttempt;
  readonly base: { readonly messageID: string; readonly from: string; readonly sentAtMs: number };
  readonly thread: string;
}

async function planReplyMail(
  deps: GmailDeps,
  context: ConnectorContext,
  request: ReplyRequest,
): Promise<OutgoingPlan> {
  const parsed = replyArgumentsSchema.safeParse(request.attempt.arguments);
  const messageText = parsed.success ? parsed.data.message : '';
  const item = parseItemID(messageText);

  if (!parsed.success || item === null) {
    return refuse('the arguments of the reply are unreadable');
  }

  const read = await readGmailMessage(deps.hosts, context, { id: item.id, format: 'full' });

  if (read.kind !== 'message') {
    return read.kind === 'missing'
      ? refuse(`UNKNOWN_MESSAGE: the message ${parsed.data.message} is gone`)
      : failRead(read.reason);
  }

  const plan = planReply(read.message, context.account, parsed.data.replyAll === true);

  if (
    !isSameSet(plan.destinations, request.attempt.destinations) ||
    !isSameSet(plan.replyTargets, request.attempt.replyTargets ?? plan.replyTargets)
  ) {
    return {
      kind: 'response',
      response: {
        kind: 'destinations_changed',
        reason: 'the recipients of the reply differ from the ones that were checked',
      },
    };
  }

  const files = await readRawFiles(deps, request.thread, parsed.data.files ?? []);

  if (files.kind === 'response') {
    return files;
  }

  return {
    kind: 'ready',
    raw: buildRawMail({
      ...request.base,
      to: plan.to,
      cc: plan.cc,
      bcc: [],
      subject: plan.subject,
      text: parsed.data.text,
      html: parsed.data.html ?? null,
      files: files.files,
      inReplyTo: plan.inReplyTo,
      references: plan.references,
    }),
    threadID: read.message.threadID,
    draftID: null,
  };
}

type RawFiles =
  | { readonly kind: 'files'; readonly files: readonly RawMailFile[] }
  | { readonly kind: 'response'; readonly response: ProviderResponse };

async function readRawFiles(
  deps: GmailDeps,
  thread: string,
  ids: readonly string[],
): Promise<RawFiles> {
  const read = await readSendFiles(deps.toolkit, deps.log, { thread, ids, withContent: true });

  if (read.status === 'error') {
    return { kind: 'response', response: { kind: 'refused', reason: read.message } };
  }

  return {
    kind: 'files',
    files: read.files.map((file) => ({
      name: file.name,
      type: file.type,
      bytes: file.content ?? new Uint8Array(0),
    })),
  };
}
