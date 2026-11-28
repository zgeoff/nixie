import type { PrepareRefusal, Prepared, ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import { forgottenOutcome } from '../call/forgotten-outcome';
import { formatReplyWake } from './format-reply-wake';
import { buildCardAttachment, formatCardFiles, joinCardList } from './gmail-card';
import { gmailDeclarations } from './gmail-declarations';
import { gmailToolNames } from './gmail-tool-names';
import { makeResolveGmailInput } from './make-resolve-gmail-input';
import { normalizeAddresses } from './normalize-addresses';
import { readCallContext } from './read-call-context';
import { readSendFiles } from './read-send-files';
import { draftInputSchema, newMailInputSchema, sendArgumentsSchema } from './send-arguments-schema';
import type { GmailDeps } from './types';

const sentOutput = {
  type: 'object',
  properties: {
    message: { type: 'string' },
    thread: { type: 'string' },
    replyRule: { type: ['string', 'null'] },
  },
  required: ['message', 'thread'],
  additionalProperties: false,
} as const;

const draftOutput = {
  type: 'object',
  properties: { draft: { type: 'string' } },
  required: ['draft'],
  additionalProperties: false,
} as const;

export type NewMailKind = 'send' | 'draft';

// gmail.send and gmail.draft: a new mail from the connected account. A send queues an action under
// the decision point, which checks each of `to`, `cc` and `bcc`; a draft queues a write that sends
// nothing. `prepare` reads the account and the files for the card.
export function buildGmailSendTool(deps: GmailDeps, kind: NewMailKind): ToolDefinition {
  const name = kind === 'send' ? gmailToolNames.send : gmailToolNames.draft;
  const schema = sendArgumentsSchema;

  return {
    name,
    description:
      kind === 'send'
        ? 'Sends a new mail from a connected Google account. The send is queued under your ' +
          "rules, and the call returns the action's ID. Once it runs, its outcome holds the " +
          'sent message and its thread.'
        : 'Writes a draft mail in a connected Google account and sends nothing. The call returns ' +
          "the action's ID, and its outcome holds the draft, which gmail.send_draft sends.",
    input: kind === 'send' ? newMailInputSchema : draftInputSchema,
    output: kind === 'send' ? sentOutput : draftOutput,
    declaration: kind === 'send' ? gmailDeclarations.send : gmailDeclarations.draft,
    execution: 'queued',
    resolveInput: makeResolveGmailInput(deps.access),
    prepare: async (input, context): Promise<Prepared | PrepareRefusal> => {
      const parsed = schema.safeParse(input);

      if (!parsed.success) {
        return { status: 'error', message: z.prettifyError(parsed.error) };
      }

      const mail = collectMailFacts(parsed.data);

      const account = await readCallContext(deps.access, input);

      if (account === null) {
        return forgottenOutcome;
      }

      const files = await readSendFiles(deps.toolkit, deps.log, {
        thread: context.run.thread,
        ids: mail.files,
        withContent: false,
      });

      if (files.status === 'error') {
        return { status: 'error', message: files.message };
      }

      return {
        destinations: kind === 'send' ? mail.destinations : [],
        attachments: [
          buildCardAttachment({
            from: account.account,
            to: joinCardList(mail.to),
            cc: joinCardList(mail.cc),
            bcc: joinCardList(mail.bcc),
            subject: mail.subject,
            files: formatCardFiles(files.files),
            replyWake: formatReplyWake(parsed.data.replyWake, deps.wake.replyExpiryMs),
          }),
        ],
      };
    },
    run: () => Promise.resolve({ status: 'error', message: `${name} runs only queued` }),
  };
}

interface MailFacts {
  readonly to: readonly string[];
  readonly cc: readonly string[];
  readonly bcc: readonly string[];
  readonly subject: string;
  readonly files: readonly string[];
  readonly destinations: readonly string[];
}

function collectMailFacts(args: z.output<typeof sendArgumentsSchema>): MailFacts {
  const to = normalizeAddresses(args.to);
  const cc = normalizeAddresses(args.cc);
  const bcc = normalizeAddresses(args.bcc);

  return {
    to,
    cc,
    bcc,
    subject: args.subject,
    files: args.files ?? [],
    destinations: [...new Set([...to, ...cc, ...bcc])],
  };
}
