import { withWriteTransaction } from '@heynixie/log';
import { conversationTaskID } from '@heynixie/tasks';
import { resolveWakeTarget, setWakeRuleInTransaction } from '@heynixie/triggers';
import { z } from 'zod';
import type { ActionAttempt, ConnectorContext } from '../../types';
import { gmailToolNames } from './gmail-tool-names';
import { pickReplyExpiry } from './pick-reply-expiry';
import { readActionFacts } from './read-action-facts';
import type { GmailDeps } from './types';

interface SentMail {
  readonly attempt: ActionAttempt;
  readonly threadID: string;
}

const argumentsSchema = z.object({ replyWake: z.string().exactOptional() });

const answeredTools: ReadonlySet<string> = new Set([gmailToolNames.send, gmailToolNames.reply]);

// Registers the reply rule of a sent mail: a rule on its Gmail thread that wakes the sender until
// `replyWake` from the start of the send. It starts with the send, so a reply that beats this write
// still matches. A draft, a sent draft, `replyWake: off` and an ended sender register none.
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
  const sentAt = facts?.firstAttemptAt ?? deps.clock.now();

  const target = await resolveWakeTarget(deps.log, senderTaskID, undefined);

  if (target.status === 'refused') {
    return null;
  }

  const rule = await withWriteTransaction(deps.log.writer, (tx) =>
    setWakeRuleInTransaction(tx, deps.wake.context(), {
      mailbox: { kind: 'gmail', connectionID: context.connectionID },
      match: { thread: sent.threadID },
      target: target.target,
      setBy: senderTaskID,
      expiresAt: sentAt + expiryMs,
      windowMs: Math.min(deps.wake.defaultWindowMs, expiryMs),
      origin: 'reply',
      createdAt: sentAt,
    }),
  );

  return rule.shortID;
}
