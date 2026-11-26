import type { SpendRaise } from '../stop/read-spend-raise';
import { buildSpendPeriods } from '../time/build-spend-periods';
import type { GatewayRaise, GatewayStatus, RoutePeriodStatus } from '../types';

// The raises that the gateway has not applied: a route's or a provider's raise of today holds more
// dollars than the day limit in force. It stands until the day ends, and the watcher sends it each
// poll.
export interface RaiseFacts {
  readonly status: GatewayStatus;
  readonly routeRaises: Readonly<Record<string, number>>;
  readonly providerRaises: Readonly<Record<string, number>>;
  readonly raise?: SpendRaise | null;
  readonly now: number;
}

export function pickRaiseResend(facts: RaiseFacts, zone: string): GatewayRaise[] {
  const today = buildSpendPeriods(facts.now, zone).day.start;
  const routes = collectResends(today, 'route', facts.routeRaises, facts.status.routes);
  const providers = collectResends(today, 'provider', facts.providerRaises, facts.status.providers);

  return [...routes, ...providers];
}

function collectResends(
  today: string,
  kind: 'route' | 'provider',
  raises: Readonly<Record<string, number>>,
  held: Readonly<Record<string, { readonly day: RoutePeriodStatus }>>,
): GatewayRaise[] {
  const resends: GatewayRaise[] = [];

  for (const [id, dollars] of Object.entries(raises)) {
    const day = Object.hasOwn(held, id) ? held[id]?.day : undefined;

    if (day === undefined || day.start !== today || day.limit === null || day.limit >= dollars) {
      continue;
    }

    resends.push({ target: { kind, id }, start: today, dollars });
  }

  return resends;
}
