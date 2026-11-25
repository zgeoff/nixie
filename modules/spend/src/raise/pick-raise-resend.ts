import type { SpendRaise } from '../stop/read-spend-raise';
import { buildSpendPeriods } from '../time/build-spend-periods';
import type { GatewayRaise, GatewayStatus } from '../types';

// The raises that the gateway has not applied: a route's raise of today holds more dollars than the
// route's day limit in force. It stands until the day ends, and the watcher sends it each poll.
export interface RaiseFacts {
  readonly status: GatewayStatus;
  readonly routeRaises: Readonly<Record<string, number>>;
  readonly raise?: SpendRaise | null;
  readonly now: number;
}

export function pickRaiseResend(facts: RaiseFacts, zone: string): GatewayRaise[] {
  const today = buildSpendPeriods(facts.now, zone).day.start;
  const resends: GatewayRaise[] = [];

  for (const [route, dollars] of Object.entries(facts.routeRaises)) {
    const day = Object.hasOwn(facts.status.routes, route)
      ? facts.status.routes[route]?.day
      : undefined;

    if (day === undefined || day.start !== today || day.limit === null || day.limit >= dollars) {
      continue;
    }

    resends.push({ route, start: today, dollars });
  }

  return resends;
}
