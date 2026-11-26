import type { Kysely } from 'kysely';
import { buildBudgetLedgerKey } from '../ledger/build-budget-ledger-key';
import { pickBudgetLimit } from '../limit/pick-budget-limit';
import { readBudgetsInForce } from '../limit/read-budgets-in-force';
import { buildBudgetBounds } from '../period/build-budget-bounds';
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

    const bounds = buildBudgetBounds(now, context.zone, limit.period);
    const ledgerKey = buildBudgetLedgerKey(budgetID, bounds.period);

    const row = await db
      .$extendTables<BudgetsTables>()
      .selectFrom('spend_ledger')
      .select('amount')
      .where('ledger_key', '=', ledgerKey)
      .executeTakeFirst();

    facts.push({
      limit,
      spentMicros: row?.amount ?? 0,
      ledgerKey,
      periodStart: bounds.period.start,
      resetsAtMs: bounds.resetsAtMs,
      resetsOn: bounds.resetsOn,
    });
  }

  return facts;
}
