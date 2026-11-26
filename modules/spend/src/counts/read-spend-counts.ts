import type { DisplayRates, SpendContext } from '../types';
import { collectProviderCounts } from './collect-provider-counts';
import { collectRouteCounts } from './collect-route-counts';
import type { ProviderCounts, RouteCounts } from './types';

export interface SpendCounts {
  readonly providers: ProviderCounts[];
  readonly routes: RouteCounts[];

  // the currency to show beside each dollar figure and the rate of one US dollar in it, or null
  // when none is set or no read has given a rate
  readonly display: { readonly currency: string; readonly rate: number } | null;
}

// Each provider's and each route's day and month count in US dollars from the gateway's status. A
// gateway that does not answer gives none, as the whole-of-nixie stop says so.
export async function readSpendCounts(context: SpendContext): Promise<SpendCounts> {
  const [status, display] = await Promise.all([
    context.gateway.readStatus(),
    readDisplay(context.display),
  ]);

  return {
    providers: status.kind === 'ok' ? collectProviderCounts(status.value) : [],
    routes: status.kind === 'ok' ? collectRouteCounts(status.value) : [],
    display,
  };
}

async function readDisplay(display: DisplayRates | undefined): Promise<SpendCounts['display']> {
  if (display === undefined) {
    return null;
  }

  const rate = await display.readRate();

  return rate === null ? null : { currency: display.currency, rate };
}
