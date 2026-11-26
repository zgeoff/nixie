import { conversationTaskID } from '@heynixie/tasks';
import { resolveWakeTarget } from '@heynixie/triggers';
import { z } from 'zod';
import type { ActionAttempt, ConnectorContext } from '../../types';
import { gmailToolNames } from './gmail-tool-names';
import { pickReplyExpiry } from './pick-reply-expiry';
import { readActionFacts } from './read-action-facts';
import type { GmailDeps } from './types';
import { writeGmailWakeRule } from './write-gmail-wake-rule';

interface SentMail {
  readonly attempt: ActionAttempt;
  readonly threadID: string;
}

const argumentsSchema = z.object({ replyWake: z.string().exactOptional() });

const answeredTools: ReadonlySet<string> = new Set([gmailToolNames.send, gmailToolNames.reply]);

// Registers the reply rule of a sent mail: a rule on its Gmail thread that wakes the sender until
// `replyWake` from the start of the send. Returns the rule's short ID, or null when the send
// registers none. A write that fails throws.
export async function writeGmailReplyRule(
  deps: GmailDeps,
  context: ConnectorContext,
  sent: SentMail,
): Promise<string | null> {
  const attempt = sent.attempt;
  const parsed = argumentsSchema.safeParse(attempt.arguments);

  if (!answeredTools.has(attempt.tool) || !parsed.success) {
    return null;
  }

  const expiry = pickReplyExpiry(parsed.data.replyWake, deps.wake.replyExpiryMs);
  const expiryMs = expiry.status === 'ok' ? expiry.expiryMs : null;

  if (expiryMs === null) {
    return null;
  }

  const facts = await readActionFacts(deps.log, attempt.actionID);

  const senderTaskID = facts?.thread ?? conversationTaskID;
  const sentAt = facts?.firstAttemptAt ?? attempt.attemptStartedAt ?? deps.clock.now();

  const target = await resolveWakeTarget(deps.log, senderTaskID, undefined);

  if (target.status === 'refused') {
    return null;
  }

  const rule = await writeGmailWakeRule(deps, {
    connectionID: context.connectionID,
    match: { thread: sent.threadID },
    target: target.target,
    setBy: senderTaskID,
    expiresAt: sentAt + expiryMs,
    windowMs: Math.min(deps.wake.defaultWindowMs, expiryMs),
    origin: 'reply',
    createdAt: sentAt,
  });

  if (rule === null) {
    return null;
  }

  return rule.shortID;
}
