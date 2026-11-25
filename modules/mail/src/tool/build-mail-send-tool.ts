import type { ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import { mailDeclarations } from '../connector/mail-declarations';
import { mailToolNames } from '../connector/mail-tool-names';
import { readMailFields } from '../store/read-mail-fields';
import { readMailRow } from '../store/read-mail-row';
import type { MailContext } from '../types';

export type MailSendKind = 'send' | 'reply';

type DestinationResolution = Awaited<
  ReturnType<NonNullable<ToolDefinition['resolveDestinations']>>
>;

const maxTextLength = 100_000;
const durationPattern = '^([1-9][0-9]{0,8}(ms|s|m|h|d)|off)$';
const addressPattern = String.raw`^[^@\s<>,;]+@[^@\s<>,;]+\.[^@\s<>,;]+$`;

const replyWakeSchema = {
  type: 'string',
  pattern: durationPattern,
  description:
    'how long a reply to this mail wakes you, such as 30m or 7d; off for no reply rule. It ' +
    "defaults to the deployment's reply expiry, and the approval card shows it.",
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
                items: { type: 'string', pattern: addressPattern },
                minItems: 1,
                maxItems: 20,
              },
              subject: { type: 'string', minLength: 1, maxLength: 998 },
              text: { type: 'string', minLength: 1, maxLength: maxTextLength },
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
              replyWake: replyWakeSchema,
            },
            required: ['message', 'text'],
            additionalProperties: false,
          },
    output: { type: 'object' },
    declaration: kind === 'send' ? mailDeclarations.send : mailDeclarations.reply,
    execution: 'queued',
    ...(kind === 'reply'
      ? {
          resolveDestinations: (input): Promise<DestinationResolution> => {
            const parsed = replyInputSchema.safeParse({ message: input['message'] });

            if (!parsed.success) {
              return Promise.resolve({ status: 'error', message: z.prettifyError(parsed.error) });
            }

            return resolveReplyDestination(context, parsed.data.message);
          },
        }
      : {}),
    run: () => Promise.resolve({ status: 'error', message: `${name} runs only queued` }),
  };
}

// The sender of the mail that a reply answers is its destination, and the one reply target.
async function resolveReplyDestination(
  context: MailContext,
  message: string,
): Promise<DestinationResolution> {
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

  return { status: 'ok', destinations: [{ value: address, replyTarget: row.direction === 'in' }] };
}
