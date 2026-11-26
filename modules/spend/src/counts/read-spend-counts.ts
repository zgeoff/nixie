import type { DisplayRates, GatewayStatus, SpendContext } from '../types';

export interface PeriodCount {
  readonly dollars: number;

  // the limit in force in US dollars, null on a route with none
  readonly limit: number | null;
  readonly tripped: boolean;
}

export interface RouteCounts {
  readonly route: string;
  readonly day: PeriodCount;
  readonly month: PeriodCount;
}

export interface SpendCounts {
  readonly routes: RouteCounts[];

  // the currency to show beside each dollar figure and the rate of one US dollar in it, or null
  // when none is set or no read has given a rate
  readonly display: { readonly currency: string; readonly rate: number } | null;
}

// Each route's day and month count in US dollars from the gateway's status. A gateway that does not
// answer gives no route, as the whole-of-nixie stop says so.
export async function readSpendCounts(context: SpendContext): Promise<SpendCounts> {
  const [status, display] = await Promise.all([
    context.gateway.readStatus(),
    readDisplay(context.display),
  ]);

  return {
    routes: status.kind === 'ok' ? collectRouteCounts(status.value) : [],
    display,
  };
}

export function collectRouteCounts(status: GatewayStatus): RouteCounts[] {
  return Object.entries(status.routes).map(([route, periods]) => ({
    route,
    day: toPeriodCount(periods.day),
    month: toPeriodCount(periods.month),
  }));
}

function toPeriodCount(period: GatewayStatus['routes'][string]['day']): PeriodCount {
  return { dollars: period.dollars, limit: period.limit, tripped: period.tripped };
}

async function readDisplay(display: DisplayRates | undefined): Promise<SpendCounts['display']> {
  if (display === undefined) {
    return null;
  }

  const rate = await display.readRate();

  return rate === null ? null : { currency: display.currency, rate };
}
