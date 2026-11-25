import { writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { triggerWakeRuleEndedCodec } from '../record/trigger-wake-rule-ended-codec';
import type { TriggersTables } from '../types';
import type { WakeRuleContext } from './set-wake-rule-in-transaction';

// Drops the matches that an already ended rule holds once its task has ended, since no target is
// left to wake. The rule keeps its first end. Returns false when the rule holds nothing.
export async function releaseHeldInTransaction(
  tx: Transaction<unknown>,
  context: WakeRuleContext,
  ruleID: string,
): Promise<boolean> {
  const held = await tx
    .$extendTables<TriggersTables>()
    .selectFrom('wake_held')
    .select('arrived_seq')
    .where('rule_id', '=', ruleID)
    .orderBy('arrived_seq')
    .execute();

  if (held.length === 0) {
    return false;
  }

  await writeRecordsInTransaction(tx, context.log, [
    {
      kind: triggerWakeRuleEndedCodec.kind,
      definitions: context.definitions(),
      payload: triggerWakeRuleEndedCodec.encode({
        ruleID,
        reason: 'task_ended',
        released: held.map((row) => row.arrived_seq),
      }),
    },
  ]);

  return true;
}
