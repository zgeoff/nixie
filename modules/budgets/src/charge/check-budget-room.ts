import type { Kysely } from 'kysely';
import type { BudgetReached, BudgetUnknown, BudgetsContext } from '../types';
import { pickChargeRefusal } from './pick-charge-refusal';
import { readChargeFacts } from './read-charge-facts';

export interface RoomRequest {
  readonly budgetIDs: readonly string[];
  readonly amountMicros: number;
}

// Reads whether every named budget has room for the amount, and writes nothing. It returns the
// budget that lacks room, the budget that no one defines, or null.
export async function checkBudgetRoom(
  db: Kysely<unknown>,
  context: BudgetsContext,
  request: RoomRequest,
): Promise<BudgetReached | BudgetUnknown | null> {
  const facts = await readChargeFacts(db, context, request.budgetIDs);

  if ('error' in facts) {
    return facts;
  }

  return pickChargeRefusal(facts, request.amountMicros);
}
