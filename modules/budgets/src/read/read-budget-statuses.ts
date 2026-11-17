import type { Kysely } from 'kysely';
import { readBudgetsInForce } from '../limit/read-budgets-in-force';
import { buildBudgetPeriod } from '../period/build-budget-period';
import type { BudgetLimit, BudgetsContext, BudgetsTables } from '../types';

export interface BudgetStatus {
  readonly id: string;
  readonly counts: string;
  readonly limitMicros: number;
  readonly period: string;
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
  const bounds = buildBudgetPeriod(context.clock.now(), context.zone, budget.period);

  const row = await db
    .$extendTables<BudgetsTables>()
    .selectFrom('budget_ledger')
    .select('spent_micros')
    .where('budget_id', '=', budget.id)
    .where('period_start', '=', bounds.start)
    .executeTakeFirst();

  return {
    id: budget.id,
    counts: budget.counts,
    limitMicros: budget.limitMicros,
    period: budget.period,
    spentMicros: row?.spent_micros ?? 0,
    periodStart: bounds.start,
    resetsAt: bounds.resetsAtMs,
    source,
  };
}
