import type { BudgetLimit } from '../types';

const dayLimitMicros = 5_000_000;
const monthLimitMicros = 50_000_000;

// A paid tool's own day and month limits, in millionths of a dollar, in place of the defaults.
export interface PaidToolLimits {
  readonly dayMicros: number;
  readonly monthMicros: number;
}

// Each paid tool has a day budget of $5 and a month budget of $50, unless `limits` names its own.
export function buildBuiltInBudgets(
  tools: readonly string[],
  limits: Readonly<Record<string, PaidToolLimits>> = {},
): readonly BudgetLimit[] {
  return tools.flatMap((tool) => {
    const own = Object.hasOwn(limits, tool) ? limits[tool] : undefined;

    return [
      {
        id: `${tool}-day`,
        counts: `tool:${tool}`,
        limitMicros: own?.dayMicros ?? dayLimitMicros,
        period: 'day',
      },
      {
        id: `${tool}-month`,
        counts: `tool:${tool}`,
        limitMicros: own?.monthMicros ?? monthLimitMicros,
        period: 'month',
      },
    ];
  });
}
