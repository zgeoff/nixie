import { createShortID } from '@heynixie/db';
import { writeRecordsInTransaction } from '@heynixie/log';
import { conversationTaskID } from '@heynixie/tasks';
import type { Transaction } from 'kysely';
import { triggerWakeRuleSetCodec } from '../record/trigger-wake-rule-set-codec';
import { wakeMatchSchema } from '../record/wake-match-schema';
import type { TriggerCoreContext, WakeRule, WakeRuleInput } from '../types';
import { toCanonicalJSON } from '../utils/to-canonical-json';
import { readLiveWakeRules } from './read-live-wake-rules';

export type WakeRuleContext = Pick<TriggerCoreContext, 'log' | 'clock' | 'definitions'>;

export interface SetWakeRule extends WakeRule {
  readonly replaced: boolean;
}

// Sets a rule in the caller's write transaction. A rule with the mailbox, match and target of a live
// rule replaces it in place: it keeps the ID, the short ID and the creation time, and takes the new
// expiry and window.
export async function setWakeRuleInTransaction(
  tx: Transaction<unknown>,
  context: WakeRuleContext,
  input: WakeRuleInput,
): Promise<SetWakeRule> {
  const now = context.clock.now();

  const live = await readLiveWakeRules(tx, input.mailbox);

  const same = live.find(
    (entry) =>
      (entry.rule.expiresAt === null || entry.rule.expiresAt > now) &&
      toCanonicalJSON(entry.rule.match) === toCanonicalJSON(input.match) &&
      toCanonicalJSON(entry.rule.target) === toCanonicalJSON(input.target),
  )?.rule;

  const rule: WakeRule = {
    ...input,
    ruleID: same?.ruleID ?? crypto.randomUUID(),
    shortID: same?.shortID ?? createShortID(),
    createdAt: same?.createdAt ?? input.createdAt ?? now,
  };

  await writeRecordsInTransaction(tx, context.log, [
    {
      kind: triggerWakeRuleSetCodec.kind,
      definitions: context.definitions(),
      payload: triggerWakeRuleSetCodec.encode({
        ruleID: rule.ruleID,
        shortID: rule.shortID,
        mailbox: 'mail',
        match: wakeMatchSchema.parse(rule.match),
        target: rule.target,
        targetTaskID: rule.target.kind === 'task' ? rule.target.taskID : conversationTaskID,
        setBy: rule.setBy,
        expiresAt: rule.expiresAt,
        windowMs: rule.windowMs,
        origin: rule.origin,
        createdAt: rule.createdAt,
      }),
    },
  ]);

  return { ...rule, replaced: same !== undefined };
}
