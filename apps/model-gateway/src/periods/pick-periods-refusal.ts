import type { Measures, Override, PeriodStore } from '../types';
import { collectTrips } from './collect-trips';
import { pickLimitInForce } from './pick-limit-in-force';

export interface PeriodsRefusal {
  readonly status: 403 | 503;
  readonly type: 'permission_error' | 'api_error';
  readonly message: string;
}

// What stops a request, or null when it may pass. A store with no room for a reason the gateway
// cannot fix, such as the lost mark or a limit the server never set, answers 503; a limit that the
// count has reached, or a sandbox the store lacks, answers 403.
export function pickPeriodsRefusal(
  store: PeriodStore,
  override: Override | null,
  sandbox: string | null,
  countBySandbox: boolean,
): PeriodsRefusal | null {
  if (store.lost) {
    return {
      status: 503,
      type: 'api_error',
      message:
        'the model gateway lost the count of a reply, so it refuses every request until an operator clears the mark in its counter store',
    };
  }

  if (store.periods.day.limit === null || store.periods.month.limit === null) {
    return {
      status: 503,
      type: 'api_error',
      message:
        'the model gateway holds no limit for a period yet, so it refuses every request until the server sets one',
    };
  }

  const held =
    sandbox !== null && Object.hasOwn(store.sandboxes, sandbox)
      ? store.sandboxes[sandbox]
      : undefined;

  if (countBySandbox && held === undefined) {
    return {
      status: 403,
      type: 'permission_error',
      message:
        'the model gateway counts by sandbox and holds no entry for this one, so it refuses the request',
    };
  }

  const [trip] = collectTrips(store, override);

  if (trip !== undefined) {
    const count = store.periods[trip.period];
    const limit = pickLimitInForce(trip.period, count, override);

    return {
      status: 403,
      type: 'permission_error',
      message: `the model gateway reached its ${trip.period} spending limit (${formatSpent(count, limit)}), so it refuses every further request`,
    };
  }

  if (
    held?.limit !== undefined &&
    held.limit !== null &&
    (held.dollars >= held.limit.dollars || held.tokens >= held.limit.tokens)
  ) {
    return {
      status: 403,
      type: 'permission_error',
      message: `the model gateway reached this sandbox's spending limit (${formatSpent(held, held.limit)}), so it refuses every further request`,
    };
  }

  return null;
}

function formatSpent(count: Measures, limit: Measures | null): string {
  const dollars = `$${count.dollars.toFixed(4)} of $${String(limit?.dollars ?? 0)}`;
  const tokens = `${String(count.tokens)} of ${String(limit?.tokens ?? 0)} tokens`;

  return `${dollars}, ${tokens}`;
}
