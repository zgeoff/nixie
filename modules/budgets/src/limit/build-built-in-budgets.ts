import type { BudgetLimit } from '../types';

const dayLimitMicros = 5_000_000;
const monthLimitMicros = 50_000_000;

// Each paid tool has a day budget of $5 and a month budget of $50.
export function buildBuiltInBudgets(tools: readonly string[]): readonly BudgetLimit[] {
  return tools.flatMap((tool) => [
    { id: `${tool}-day`, counts: `tool:${tool}`, limitMicros: dayLimitMicros, period: 'day' },
    { id: `${tool}-month`, counts: `tool:${tool}`, limitMicros: monthLimitMicros, period: 'month' },
  ]);
}
