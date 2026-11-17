import type { Kysely } from 'kysely';
import { pickBudgetLimit } from '../limit/pick-budget-limit';
import { readBudgetsInForce } from '../limit/read-budgets-in-force';
import { buildBudgetPeriod } from '../period/build-budget-period';
import type { BudgetUnknown, BudgetsContext, BudgetsTables } from '../types';
import type { ChargeFact } from './pick-charge-refusal';

// Each named budget's limit, period and spent amount, or the first budget that no one defines.
export async function readChargeFacts(
  db: Kysely<unknown>,
  context: BudgetsContext,
  budgetIDs: readonly string[],
): Promise<readonly ChargeFact[] | BudgetUnknown> {
  const inForce = await readBudgetsInForce(db);

  const now = context.clock.now();
  const facts: ChargeFact[] = [];

  for (const budgetID of budgetIDs) {
    const limit = pickBudgetLimit(budgetID, inForce, context.builtIn());

    if (limit === null) {
      return { error: 'budget_unknown', budgetID };
    }

    const bounds = buildBudgetPeriod(now, context.zone, limit.period);

    const row = await db
      .$extendTables<BudgetsTables>()
      .selectFrom('budget_ledger')
      .select('spent_micros')
      .where('budget_id', '=', budgetID)
      .where('period_start', '=', bounds.start)
      .executeTakeFirst();

    facts.push({ limit, spentMicros: row?.spent_micros ?? 0, bounds });
  }

  return facts;
}
