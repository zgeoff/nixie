import type { BudgetDefinition } from '@heynixie/policy';
import { buildSHA256 } from './build-sha256';
import { toCanonicalJSON } from './to-canonical-json';

export function buildBudgetHash(budget: Omit<BudgetDefinition, 'id'>): string {
  return buildSHA256(
    toCanonicalJSON({
      counts: budget.counts,
      limitMicros: budget.limitMicros,
      period: budget.period,
    }),
  );
}
