import { planBackoffDelay } from '@heynixie/retry';
import { healthDefaults } from './types';
import type { ListingFailureCause, ServerHealth } from './types';

export type ListingOutcome =
  | { readonly kind: 'passed' }
  | { readonly kind: 'failed'; readonly cause: ListingFailureCause };

// The one record the outcome owes: written when the server becomes unhealthy and when an unhealthy
// server passes again, and never for another listing.
export interface HealthChange {
  readonly isUnhealthy: boolean;
  readonly lastError: ListingFailureCause | null;
  readonly nextTryAtMs: number | null;
}

export interface HealthPlan {
  readonly next: ServerHealth;
  readonly change: HealthChange | null;
}

export function planHealth(
  previous: ServerHealth,
  outcome: ListingOutcome,
  nowMs: number,
): HealthPlan {
  if (outcome.kind === 'passed') {
    return {
      next: {
        failures: 0,
        nextTryAtMs: null,
        lastError: null,
        hasPassed: true,
        isUnhealthy: false,
      },
      change: previous.isUnhealthy
        ? { isUnhealthy: false, lastError: null, nextTryAtMs: null }
        : null,
    };
  }

  const failures = previous.failures + 1;

  const nextTryAtMs =
    nowMs +
    planBackoffDelay(failures, {
      firstMs: healthDefaults.firstTryMs,
      maxMs: healthDefaults.maxTryMs,
    });

  const isUnhealthy = failures >= healthDefaults.unhealthyAfter;

  return {
    next: { failures, nextTryAtMs, lastError: outcome.cause, hasPassed: false, isUnhealthy },
    change:
      isUnhealthy && !previous.isUnhealthy
        ? { isUnhealthy: true, lastError: outcome.cause, nextTryAtMs }
        : null,
  };
}
