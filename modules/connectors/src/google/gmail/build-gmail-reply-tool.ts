import type { PrepareRefusal, Prepared, ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import { decodeHeaderWords } from './decode-header-words';
import { formatReplyWake } from './format-reply-wake';
import { buildCardAttachment, formatCardFiles, joinCardList } from './gmail-card';
import { gmailDeclarations } from './gmail-declarations';
import { gmailToolNames } from './gmail-tool-names';
import { makeResolveGmailInput } from './make-resolve-gmail-input';
import { parseItemID } from './parse-item-id';
import { planReply } from './plan-reply';
import { readCallContext } from './read-call-context';
import { readGmailMessage } from './read-gmail-message';
import { readSendFiles } from './read-send-files';
import { replyArgumentsSchema, replyInputSchema } from './send-arguments-schema';
import type { GmailDeps } from './types';

// gmail.reply: an answer to one message of the account, in its thread. The recipients come from the
// message, read live in `prepare`, and never from the model. The sender of the message is the reply
// target, except for a message in Spam or Trash or one the account wrote.
export function buildGmailReplyTool(deps: GmailDeps): ToolDefinition {
  return {
    name: gmailToolNames.reply,
    description:
      'Replies to a message of a connected Google account, in its thread. The recipients come ' +
      'from the message: its Reply-To or sender, and with replyAll its other recipients too. The ' +
      "reply is queued under your rules, and the call returns the action's ID. Once it runs, " +
      'its outcome holds the sent message and its thread.',
    input: replyInputSchema,
    output: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        thread: { type: 'string' },
        replyRule: { type: ['string', 'null'] },
      },
      required: ['message', 'thread'],
      additionalProperties: false,
    },
    declaration: gmailDeclarations.reply,
    execution: 'queued',
    resolveInput: makeResolveGmailInput(deps.access),
    prepare: async (input, context): Promise<Prepared | PrepareRefusal> => {
      const parsed = replyArgumentsSchema.safeParse(input);
      const itemText = input['message'];
      const itemID = typeof itemText === 'string' ? itemText : '';
      const item = parseItemID(itemID);

      const account = await readCallContext(deps.access, input);

      if (!parsed.success) {
        return { status: 'error', message: z.prettifyError(parsed.error) };
      }

      if (account === null || item === null) {
        return { status: 'error', message: 'CONNECTION_FORGOTTEN: the connection was forgotten' };
      }

      const read = await readGmailMessage(deps.hosts, account, { id: item.id, format: 'full' });

      if (read.kind !== 'message') {
        return {
          status: 'error',
          message:
            read.kind === 'missing'
              ? `UNKNOWN_MESSAGE: no message has the ID ${parsed.data.message}`
              : `GMAIL_FAILED: ${read.reason}`,
        };
      }

      const plan = planReply(read.message, account.account, parsed.data.replyAll === true);

      if (plan.destinations.length === 0) {
        return {
          status: 'error',
          message: `NO_RECIPIENT: the message ${parsed.data.message} has no address that a reply can go to`,
        };
      }

      const files = await readSendFiles(deps.log, {
        thread: context.run.thread,
        ids: parsed.data.files ?? [],
        withContent: false,
      });

      if (files.status === 'error') {
        return { status: 'error', message: files.message };
      }

      const original = read.message;

      return {
        destinations: plan.destinations,
        replyTargets: plan.replyTargets,
        attachments: [
          buildCardAttachment({
            from: account.account,
            to: joinCardList(plan.to),
            cc: joinCardList(plan.cc),
            replyTo: joinCardList(plan.to),
            subject: plan.subject,
            inReplyTo: `${plan.sender}, ${formatDay(original.internalDateMs)}, "${decodeHeaderWords(original.payload.headers.get('subject') ?? '')}"`,
            files: formatCardFiles(files.files),
            replyWake: formatReplyWake(parsed.data.replyWake, deps.wake.replyExpiryMs),
          }),
        ],
      };
    },
    run: () =>
      Promise.resolve({ status: 'error', message: `${gmailToolNames.reply} runs only queued` }),
  };
}

function formatDay(timeMs: number): string {
  return new Date(timeMs).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
