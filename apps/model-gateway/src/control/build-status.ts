import { buildResetMs } from '../periods/build-reset-ms';
import { collectTrips } from '../periods/collect-trips';
import { pickLimitInForce } from '../periods/pick-limit-in-force';
import type { Measures, Override, PeriodName, PeriodStore, PeriodsConfig } from '../types';

interface PeriodStatus {
  readonly start: string;
  readonly resetsAt: string;
  readonly spent: Measures;
  readonly limit: Measures | null;
  readonly cap: Measures;
}

type StatusTrip =
  | { readonly period: PeriodName; readonly measure: 'dollars' | 'tokens'; readonly at: string }
  | { readonly lost: true; readonly at: string };

export interface GatewayStatus {
  readonly zone: string;
  readonly lost: boolean;
  readonly periods: Readonly<Record<PeriodName, PeriodStatus>>;
  readonly tripped: StatusTrip | null;
}

// The status holds each period's limit in force. A limit trip's `at` is the instant the store first
// saw the period at its limit. The store keeps no instant for the lost mark, which an operator
// clears by deleting the field, so its `at` is the time of this read.
export function buildStatus(
  store: PeriodStore,
  override: Override | null,
  config: PeriodsConfig,
  nowMs: number,
): GatewayStatus {
  const buildPeriod = (name: PeriodName): PeriodStatus => {
    const count = store.periods[name];

    return {
      start: count.start,
      resetsAt: formatInstant(buildResetMs(name, count)),
      spent: { dollars: count.dollars, tokens: count.tokens },
      limit: pickLimitInForce(name, count, override),
      cap: config.caps[name],
    };
  };

  const readAt = formatInstant(nowMs);
  const [trip] = collectTrips(store, override);
  let tripped: StatusTrip | null = null;

  if (trip !== undefined) {
    // the override file can change between the store's stamp and this read
    const stamped = store.periods[trip.period].trippedAt;

    tripped = { ...trip, at: stamped === null ? readAt : formatInstant(Date.parse(stamped)) };
  } else if (store.lost) {
    tripped = { lost: true, at: readAt };
  }

  return {
    zone: config.zone,
    lost: store.lost,
    periods: { day: buildPeriod('day'), month: buildPeriod('month') },
    tripped,
  };
}

function formatInstant(instantMs: number): string {
  return new Date(instantMs).toISOString().replace(/\.\d{3}Z$/u, 'Z');
}
