import type { ActionAttempt, ProviderResponse } from '@heynixie/connections';
import { buildItemID } from './build-item-id';
import { callGmail } from './call-gmail';
import { gmailToolNames } from './gmail-tool-names';
import { pickGmailErrorResponse } from './pick-gmail-error-response';
import { planOutgoingMail } from './plan-outgoing-mail';
import type { OutgoingTool } from './plan-outgoing-mail';
import { readCallContext } from './read-call-context';
import type { GmailDeps } from './types';
import { writeGmailReplyRule } from './write-gmail-reply-rule';

// The attempt of a send, a reply or a sent draft: plans the mail from Google and the queue, and
// sends it with the action's Message-ID. A draft's attempt writes the draft and sends nothing.
export async function runGmailSend(
  deps: GmailDeps,
  tool: OutgoingTool,
  attempt: ActionAttempt,
): Promise<ProviderResponse> {
  const context = await readCallContext(deps.access, attempt.arguments);

  if (context === null) {
    return { kind: 'refused', reason: 'connection_forgotten' };
  }

  const plan = await planOutgoingMail(deps, context, { tool, attempt });

  if (plan.kind === 'response') {
    return plan.response;
  }

  if (tool === gmailToolNames.draft) {
    const written = await callGmail(deps.hosts, context, {
      path: '/drafts',
      method: 'POST',
      json: { message: { raw: plan.raw } },
    });

    if (written.kind === 'error') {
      return pickGmailErrorResponse(written);
    }

    const id = readID(written.body);

    return id === null
      ? { kind: 'ambiguous', reason: 'Gmail answered with no draft' }
      : { kind: 'success', result: { draft: buildItemID(context.connection, id) } };
  }

  const sent = await callGmail(deps.hosts, context, {
    path: '/messages/send',
    method: 'POST',
    json: { raw: plan.raw, ...(plan.threadID === null ? {} : { threadId: plan.threadID }) },
  });

  if (sent.kind === 'error') {
    return pickGmailErrorResponse(sent);
  }

  const id = readID(sent.body);

  if (id === null) {
    return { kind: 'ambiguous', reason: 'Gmail answered with no message' };
  }

  if (plan.draftID !== null) {
    // the mail is out; a draft that stays behind only needs the owner's tidy
    await removeDraft(deps, context, plan.draftID).catch(() => {});
  }

  const threadID = readField(sent.body, 'threadId') ?? id;

  // The mail is out. A rule that cannot be written leaves the outcome open, and the check of the
  // send finds the mail and writes the rule again.
  const replyRule = await writeGmailReplyRule(deps, context, { attempt, threadID }).catch(
    () => false as const,
  );

  if (replyRule === false) {
    return { kind: 'ambiguous', reason: 'Gmail took the mail, but its reply rule was not written' };
  }

  return {
    kind: 'success',
    result: {
      message: buildItemID(context.connection, id),
      thread: buildItemID(context.connection, threadID),
      replyRule,
    },
  };
}

function readID(body: unknown): string | null {
  return readField(body, 'id');
}

function readField(body: unknown, key: string): string | null {
  if (typeof body !== 'object' || body === null || !(key in body)) {
    return null;
  }

  const value: unknown = Reflect.get(body, key);

  return typeof value === 'string' ? value : null;
}

function removeDraft(
  deps: GmailDeps,
  context: Parameters<typeof callGmail>[1],
  draftID: string,
): Promise<unknown> {
  return callGmail(deps.hosts, context, {
    path: `/drafts/${encodeURIComponent(draftID)}`,
    method: 'DELETE',
  });
}
