import type { ActionAttempt, CheckResponse } from '@heynixie/connections';
import { z } from 'zod';
import { buildItemID } from './build-item-id';
import { buildSendMessageID } from './build-send-message-id';
import { callGmail } from './call-gmail';
import { readCallContext } from './read-call-context';
import { readGmailDraft } from './read-gmail-draft';
import { stripAngleBrackets } from './strip-angle-brackets';
import type { GmailDeps } from './types';

const draftRefSchema = z.object({ id: z.string() });
const listSchema = z.object({ drafts: z.array(draftRefSchema).exactOptional() });

// The read-only check of a draft write: found when the account holds a draft whose Message-ID is the
// action's, as the Sent-folder check reads it.
export async function checkGmailDraft(
  deps: GmailDeps,
  attempt: ActionAttempt,
): Promise<CheckResponse> {
  const context = await readCallContext(deps.access, attempt.arguments);

  if (context === null) {
    return { kind: 'inconclusive' };
  }

  const messageID = buildSendMessageID(context.account, attempt.actionID);

  const listed = await callGmail(deps.hosts, context, {
    path: '/drafts',
    search: `rfc822msgid:${messageID}`,
  });

  const parsed = listed.kind === 'ok' ? listSchema.safeParse(listed.body) : null;

  if (parsed === null || !parsed.success) {
    return { kind: 'inconclusive' };
  }

  for (const entry of parsed.data.drafts ?? []) {
    const read = await readGmailDraft(deps.hosts, context, entry.id);

    if (read.kind === 'failed') {
      return { kind: 'inconclusive' };
    }

    const header = read.kind === 'draft' ? read.message.payload.headers.get('message-id') : null;

    if (stripAngleBrackets(header) === messageID) {
      return { kind: 'found', result: { draft: buildItemID(context.connection, entry.id) } };
    }
  }

  return { kind: 'not_found' };
}
