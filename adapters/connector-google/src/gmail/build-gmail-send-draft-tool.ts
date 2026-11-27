import type { PrepareRefusal, Prepared, ToolDefinition } from '@heynixie/connections';
import { z } from 'zod';
import { buildDraftDigest } from './build-draft-digest';
import { collectAddresses } from './collect-addresses';
import { collectMessageContent } from './collect-message-content';
import { decodeHeaderWords } from './decode-header-words';
import { decodePartText } from './decode-part-text';
import { buildCardAttachment, formatCardFiles, joinCardList } from './gmail-card';
import { gmailDeclarations } from './gmail-declarations';
import { gmailToolNames } from './gmail-tool-names';
import { makeResolveGmailDraftInput } from './make-resolve-gmail-draft-input';
import { parseItemID } from './parse-item-id';
import { readCallContext } from './read-call-context';
import { readGmailDraft } from './read-gmail-draft';
import { readGmailRaw } from './read-gmail-raw';
import { readPartBytes } from './read-part-bytes';
import { sendDraftArgumentsSchema, sendDraftInputSchema } from './send-arguments-schema';
import type { GmailDeps } from './types';

// gmail.send_draft: sends a draft of the account. `prepare` reads the draft's recipients, subject,
// text and files, so the decision point checks each recipient and the card shows the whole mail.
export function buildGmailSendDraftTool(deps: GmailDeps): ToolDefinition {
  return {
    name: gmailToolNames.sendDraft,
    description:
      'Sends a draft of a connected Google account, such as one that gmail.draft wrote. The ' +
      "send is queued under your rules, and the call returns the action's ID. Once it runs, " +
      'its outcome holds the sent message and its thread.',
    input: sendDraftInputSchema,
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
    declaration: gmailDeclarations.sendDraft,
    execution: 'queued',
    resolveInput: makeResolveGmailDraftInput(deps),
    prepare: async (input): Promise<Prepared | PrepareRefusal> => {
      const parsed = sendDraftArgumentsSchema.safeParse(input);
      const itemText = input['draft'];
      const itemID = typeof itemText === 'string' ? itemText : '';
      const item = parseItemID(itemID);

      const account = await readCallContext(deps.access, input);

      if (!parsed.success) {
        return { status: 'error', message: z.prettifyError(parsed.error) };
      }

      if (account === null || item === null) {
        return { status: 'error', message: 'CONNECTION_FORGOTTEN: the connection was forgotten' };
      }

      const read = await readGmailDraft(deps.hosts, account, item.id);

      if (read.kind !== 'draft') {
        return {
          status: 'error',
          message:
            read.kind === 'missing'
              ? `UNKNOWN_DRAFT: no draft has the ID ${parsed.data.draft}`
              : `GMAIL_FAILED: ${read.reason}`,
        };
      }

      // The card shows this message, so the digest the queued send carries must be this message's.
      // A draft that changed since the endpoint took its digest never reaches the owner's card.
      const raw = await readGmailRaw(deps.hosts, account, read.message.id);

      if (raw.kind === 'failed') {
        return { status: 'error', message: `GMAIL_FAILED: ${raw.reason}` };
      }

      if (buildDraftDigest(raw.text) !== parsed.data.digest) {
        return {
          status: 'error',
          message:
            'CHANGED: the draft changed while the send was being checked, and nothing was queued',
        };
      }

      const headers = read.message.payload.headers;
      const to = collectAddresses(headers.get('to'));
      const cc = collectAddresses(headers.get('cc'));
      const bcc = collectAddresses(headers.get('bcc'));
      const content = collectMessageContent(read.message);

      if (to.length + cc.length + bcc.length === 0) {
        return { status: 'error', message: 'NO_RECIPIENT: the draft has no recipient' };
      }

      const text =
        content.textPart === null
          ? null
          : await readPartBytes(deps.hosts, account, {
              message: read.message.id,
              part: content.textPart,
            });

      if (text?.kind === 'failed') {
        return { status: 'error', message: `GMAIL_FAILED: ${text.reason}` };
      }

      return {
        destinations: [...new Set([...to, ...cc, ...bcc])],
        attachments: [
          buildCardAttachment({
            from: account.account,
            to: joinCardList(to),
            cc: joinCardList(cc),
            bcc: joinCardList(bcc),
            subject: decodeHeaderWords(headers.get('subject') ?? ''),
            text:
              text?.kind === 'bytes' && content.textPart !== null
                ? decodePartText(text.bytes, content.textPart.headers.get('content-type'))
                : '',
            files: formatCardFiles(content.attachments),
          }),
        ],
      };
    },
    run: () =>
      Promise.resolve({ status: 'error', message: `${gmailToolNames.sendDraft} runs only queued` }),
  };
}
