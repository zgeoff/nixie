import type { BudgetCounts, BudgetPeriod } from '@heynixie/policy';
import type { Kysely } from 'kysely';
import { buildBudgetLedgerKey } from '../ledger/build-budget-ledger-key';
import { readBudgetsInForce } from '../limit/read-budgets-in-force';
import { buildBudgetBounds } from '../period/build-budget-bounds';
import type { BudgetLimit, BudgetsContext, BudgetsTables } from '../types';

export interface BudgetStatus {
  readonly id: string;
  readonly counts: BudgetCounts;
  readonly limitMicros: number;
  readonly period: BudgetPeriod;
  readonly spentMicros: number;
  readonly periodStart: string;
  readonly resetsAt: number;
  readonly source: 'definitions' | 'built_in';
}

// Each budget in force and each built-in budget that none in force replaces, with what its period
// in force has spent.
export async function readBudgetStatuses(
  db: Kysely<unknown>,
  context: BudgetsContext,
): Promise<readonly BudgetStatus[]> {
  const inForce = await readBudgetsInForce(db);

  const replaced = new Set(inForce.map((budget) => budget.id));

  const budgets = [
    ...inForce.map((budget) => ({ budget, source: 'definitions' as const })),
    ...context
      .builtIn()
      .filter((budget) => !replaced.has(budget.id))
      .map((budget) => ({ budget, source: 'built_in' as const })),
  ].toSorted((left, right) => (left.budget.id < right.budget.id ? -1 : 1));

  const statuses: BudgetStatus[] = [];

  for (const entry of budgets) {
    const status = await readStatus(db, context, entry.budget, entry.source);

    statuses.push(status);
  }

  return statuses;
}

async function readStatus(
  db: Kysely<unknown>,
  context: BudgetsContext,
  budget: BudgetLimit,
  source: BudgetStatus['source'],
): Promise<BudgetStatus> {
  const bounds = buildBudgetBounds(context.clock.now(), context.zone, budget.period);

  const row = await db
    .$extendTables<BudgetsTables>()
    .selectFrom('spend_ledger')
    .select('amount')
    .where('ledger_key', '=', buildBudgetLedgerKey(budget.id, bounds.period))
    .executeTakeFirst();

  return {
    id: budget.id,
    counts: budget.counts,
    limitMicros: budget.limitMicros,
    period: budget.period,
    spentMicros: row?.amount ?? 0,
    periodStart: bounds.period.start,
    resetsAt: bounds.resetsAtMs,
    source,
  };
}
