import type { SpendRaise } from '../stop/read-spend-raise';
import { buildSpendPeriods } from '../time/build-spend-periods';
import type { GatewayRaise, GatewayStatus } from '../types';

// The raise that the gateway has not applied: today's raise holds more dollars or tokens than the
// day's limit in force. It stands until the day ends, and the watcher sends it each poll.
export interface RaiseFacts {
  readonly status: GatewayStatus;
  readonly raise: SpendRaise | null;
  readonly now: number;
}

export function pickRaiseResend(facts: RaiseFacts, zone: string): GatewayRaise | null {
  const day = facts.status.periods.day;
  const today = buildSpendPeriods(facts.now, zone).day.start;

  if (facts.raise === null || day.start !== today || day.limit === null) {
    return null;
  }

  const isApplied =
    day.limit.dollars >= facts.raise.dollars && day.limit.tokens >= facts.raise.tokens;

  return isApplied
    ? null
    : { start: today, limit: { dollars: facts.raise.dollars, tokens: facts.raise.tokens } };
}
