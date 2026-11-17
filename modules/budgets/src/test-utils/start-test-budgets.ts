import type { Log, Writer } from '@heynixie/log';
import { logProjections, withWriteTransaction } from '@heynixie/log';
import { startTestLog } from '@heynixie/log/test-utils';
import type { TestClock } from '@heynixie/testing';
import { chargeBudgetsInTransaction } from '../charge/charge-budgets-in-transaction';
import { creditBudgetChargesInTransaction } from '../charge/credit-budget-charges-in-transaction';
import type { CreditTarget } from '../charge/credit-budget-charges-in-transaction';
import { buildBuiltInBudgets } from '../limit/build-built-in-budgets';
import { budgetProjections } from '../projection/budget-projections';
import type { BudgetLimit, BudgetsContext, ChargeRequest, ChargeResult } from '../types';
import { seedBudgetInForce } from './seed-budget-in-force';

export interface TestBudgets {
  readonly writer: Writer;
  readonly log: Log;
  readonly clock: TestClock;
  readonly context: BudgetsContext;
  readonly charge: (request: ChargeRequest) => Promise<ChargeResult>;
  readonly credit: (target: CreditTarget) => Promise<number>;

  // puts a budget in force as the seed does
  readonly seedBudgetInForce: (budget: BudgetLimit) => Promise<void>;
}

// A log that folds the budget records, and the context on top. The clock starts at 09:00 UTC on
// 2026-10-16, a Friday, and the zone is UTC. The built-in budgets are those of a tool named search.
export async function startTestBudgets(
  options: { readonly zone?: string } = {},
): Promise<TestBudgets> {
  const started = await startTestLog();

  const log: Log = { ...started.log, projections: [...logProjections, ...budgetProjections] };
  const definitions = { snapshotHash: 'sha256:aa11' };

  const context: BudgetsContext = {
    log,
    clock: started.clock,
    zone: options.zone ?? 'UTC',
    definitions: () => definitions,
    builtIn: buildBuiltInBudgets(['search']),
  };

  return {
    writer: started.writer,
    log,
    clock: started.clock,
    context,
    charge: (request) =>
      withWriteTransaction(started.writer, (tx) =>
        chargeBudgetsInTransaction(tx, context, request),
      ),
    credit: (target) =>
      withWriteTransaction(started.writer, (tx) =>
        creditBudgetChargesInTransaction(tx, context, target),
      ),
    seedBudgetInForce: (budget) => seedBudgetInForce(started.writer, budget),
  };
}
