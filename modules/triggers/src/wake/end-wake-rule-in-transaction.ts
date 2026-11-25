import { writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { triggerWakeRuleEndedCodec } from '../record/trigger-wake-rule-ended-codec';
import type { TriggersTables, WakeRuleEndReason } from '../types';
import type { WakeRuleContext } from './set-wake-rule-in-transaction';

// Ends a rule in the caller's write transaction. Returns false when the rule is unknown or ended
// already. A cancelled rule drops nothing, so its held matches still flush; a rule of an ended task
// drops its held matches.
export async function endWakeRuleInTransaction(
  tx: Transaction<unknown>,
  context: WakeRuleContext,
  ruleID: string,
  reason: WakeRuleEndReason,
): Promise<boolean> {
  const db = tx.$extendTables<TriggersTables>();

  const rule = await db
    .selectFrom('wake_rules')
    .select('ended_at')
    .where('rule_id', '=', ruleID)
    .executeTakeFirst();

  if (rule === undefined || rule.ended_at !== null) {
    return false;
  }

  const released =
    reason === 'cancelled'
      ? []
      : await db
          .selectFrom('wake_held')
          .select('arrived_seq')
          .where('rule_id', '=', ruleID)
          .orderBy('arrived_seq')
          .execute();

  await writeRecordsInTransaction(tx, context.log, [
    {
      kind: triggerWakeRuleEndedCodec.kind,
      definitions: context.definitions(),
      payload: triggerWakeRuleEndedCodec.encode({
        ruleID,
        reason,
        released: released.map((row) => row.arrived_seq),
      }),
    },
  ]);

  return true;
}
