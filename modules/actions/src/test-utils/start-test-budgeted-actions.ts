import type { BudgetsContext } from '@heynixie/budgets';
import { budgetProjections } from '@heynixie/budgets';
import { seedBudgetInForce } from '@heynixie/budgets/test-utils';
import type { TestTasks } from '@heynixie/tasks/test-utils';
import { startTestActions } from './start-test-actions';

export interface TestBudgetedActions extends TestTasks {
  readonly budgets: BudgetsContext;
}

// Actions on a log that also folds the budget records, with one purchase budget in force: a day
// budget of 10 dollars that counts spend.
export async function startTestBudgetedActions(): Promise<TestBudgetedActions> {
  const actions = await startTestActions();

  const log = {
    ...actions.context.log,
    projections: [...actions.context.log.projections, ...budgetProjections],
  };

  const budgets: BudgetsContext = {
    log,
    clock: actions.clock,
    zone: 'UTC',
    definitions: actions.context.definitions,
    builtIn: () => [],
  };

  await seedBudgetInForce(actions.writer, {
    id: 'groceries',
    counts: 'spend',
    limitMicros: 10_000_000,
    period: 'day',
  });

  return { ...actions, budgets, context: { ...actions.context, log, budgets } };
}
