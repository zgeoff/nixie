import type { JSONObject } from '@heynixie/log';
import type { DestinationResolution, ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import { mailDeclarations } from '../connector/mail-declarations';
import { mailToolNames } from '../connector/mail-tool-names';
import { readSendFiles } from '../connector/read-send-files';
import { isMailAddress } from '../parse/is-mail-address';
import { mailAddressPattern } from '../parse/mail-address-pattern';
import { readMailFields } from '../store/read-mail-fields';
import { readMailRow } from '../store/read-mail-row';
import type { MailContext } from '../types';

export type MailSendKind = 'send' | 'reply';

const maxTextLength = 100_000;
const durationPattern = '^([1-9][0-9]{0,6}(m|h|d)|off)$';

const replyWakeSchema = {
  type: 'string',
  pattern: durationPattern,
  description:
    'how long a reply to this mail wakes you, such as 30m or 7d; off for no reply rule. It ' +
    "defaults to the deployment's reply expiry, and the approval card shows it.",
} as const;

const filesSchema = {
  type: 'array',
  items: { type: 'string' },
  maxItems: 10,
  description:
    'file IDs of this thread to attach, up to 10 and 25 MiB in all, such as one that ' +
    'mail.save_attachment or a code run made',
} as const;

const replyInputSchema = z.strictObject({ message: z.string() });

// mail.send and mail.reply. Each queues its action under the decision point, which asks about each
// recipient, and the action's outcome holds the sent mail and the reply rule that the send set.
export function buildMailSendTool(context: MailContext, kind: MailSendKind): ToolDefinition {
  const name = kind === 'send' ? mailToolNames.send : mailToolNames.reply;

  return {
    name,
    description:
      kind === 'send'
        ? 'Sends a new mail from your own address. The send is queued, and the call returns the ' +
          "action's ID. Once it runs, its outcome holds the sent mail, its thread and the reply " +
          'rule that wakes you when someone answers.'
        : 'Replies to a mail of your own mailbox, in its thread, from your own address. The ' +
          "reply is queued, and the call returns the action's ID. Once it runs, its outcome holds " +
          'the sent mail, its thread and the reply rule that wakes you when someone answers.',
    input:
      kind === 'send'
        ? {
            type: 'object',
            properties: {
              to: {
                type: 'array',
                items: { type: 'string', pattern: mailAddressPattern },
                minItems: 1,
                maxItems: 20,
              },
              subject: { type: 'string', minLength: 1, maxLength: 998 },
              text: { type: 'string', minLength: 1, maxLength: maxTextLength },
              files: filesSchema,
              replyWake: replyWakeSchema,
            },
            required: ['to', 'subject', 'text'],
            additionalProperties: false,
          }
        : {
            type: 'object',
            properties: {
              message: { type: 'string', description: 'the ID of the mail you answer' },
              text: { type: 'string', minLength: 1, maxLength: maxTextLength },
              files: filesSchema,
              replyWake: replyWakeSchema,
            },
            required: ['message', 'text'],
            additionalProperties: false,
          },
    output: { type: 'object' },
    declaration: kind === 'send' ? mailDeclarations.send : mailDeclarations.reply,
    execution: 'queued',
    resolveDestinations: async (input, toolContext): Promise<DestinationResolution> => {
      const files = await readFilesOfCall(context, input, toolContext.run.thread);

      if (files !== null) {
        return files;
      }

      if (kind === 'send') {
        return {
          status: 'ok',
          destinations: collectRecipients(input['to']).map((value) => ({
            value: value.normalize('NFC'),
            replyTarget: false,
          })),
        };
      }

      const parsed = replyInputSchema.safeParse({ message: input['message'] });

      if (!parsed.success) {
        return { status: 'error', message: z.prettifyError(parsed.error) };
      }

      return resolveReplyDestination(context, {
        message: parsed.data.message,
        arrivedMails: toolContext.run.session?.policy?.arrivedMails ?? [],
      });
    },
    run: () => Promise.resolve({ status: 'error', message: `${name} runs only queued` }),
  };
}

const filesInputSchema = z.strictObject({ files: z.array(z.string()).max(10).exactOptional() });

// Refuses a call whose files cannot go, with the code of the reason, or null when each one can.
async function readFilesOfCall(
  context: MailContext,
  input: JSONObject,
  thread: string,
): Promise<DestinationResolution | null> {
  const named = input['files'] === undefined ? {} : { files: input['files'] };
  const parsed = filesInputSchema.safeParse(named);

  if (!parsed.success) {
    return { status: 'error', message: z.prettifyError(parsed.error) };
  }

  const files = await readSendFiles(context.ports, thread, parsed.data.files ?? []);

  return files.status === 'ok' ? null : { status: 'error', message: files.message };
}

function collectRecipients(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

interface ReplyRequest {
  readonly message: string;

  // the mail whose arrival woke the turn that makes the call
  readonly arrivedMails: readonly string[];
}

// The sender of the mail that a reply answers is its destination. It is a reply target only when
// that mail's arrival woke this turn, because the sender's address is text the mail itself claims.
async function resolveReplyDestination(
  context: MailContext,
  request: ReplyRequest,
): Promise<DestinationResolution> {
  const message = request.message;

  const unknown: DestinationResolution = {
    status: 'error',
    message: `UNKNOWN_MESSAGE: no mail has the ID ${message}`,
  };

  const row = await readMailRow(context.log, message);

  if (row === null) {
    return unknown;
  }

  const stored = await readMailFields(context, [row]);

  const fields = stored.get(row.record_sequence);

  if (fields === undefined) {
    return unknown;
  }

  const address = row.direction === 'in' ? fields.from : (fields.to[0] ?? '');

  if (!isMailAddress(address)) {
    return {
      status: 'error',
      message: `BAD_ADDRESS: the mail ${message} has no sender address that a reply can go to`,
    };
  }

  const isReplyTarget = row.direction === 'in' && request.arrivedMails.includes(row.short_id);

  return { status: 'ok', destinations: [{ value: address, replyTarget: isReplyTarget }] };
}
