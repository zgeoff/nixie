import type { Transaction } from 'kysely';
import type { ActionRiskClass, ActionsTables } from '../types';

// The risk class of an action that waits for the owner's answer about its unknown outcome, or null
// when the action did not reach the owner or an answer already settled it.
export async function readUnknownWaiting(
  tx: Transaction<unknown>,
  actionID: string,
): Promise<ActionRiskClass | null> {
  const action = await tx
    .$extendTables<ActionsTables>()
    .selectFrom('actions')
    .select('risk_class')
    .where('action_id', '=', actionID)
    .where('status', '=', 'unknown')
    .where('outcome_sequence', 'is not', null)
    .executeTakeFirst();

  return action === undefined ? null : action.risk_class;
}
