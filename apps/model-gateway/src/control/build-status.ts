import { collectTrips } from '../periods/collect-trips';
import { getResetMs } from '../periods/get-reset-ms';
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

// The status holds each period's limit in force. `at` is the time of the read that found the trip,
// because the store keeps no time for it.
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
      resetsAt: formatInstant(getResetMs(name, count.start, config.zone)),
      spent: { dollars: count.dollars, tokens: count.tokens },
      limit: pickLimitInForce(name, count, override),
      cap: config.caps[name],
    };
  };

  const at = formatInstant(nowMs);
  const [trip] = collectTrips(store, override);
  let tripped: StatusTrip | null = null;

  if (trip !== undefined) {
    tripped = { ...trip, at };
  } else if (store.lost) {
    tripped = { lost: true, at };
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
