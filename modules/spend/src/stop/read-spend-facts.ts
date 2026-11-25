import { readPlanLogins } from '../login/read-plan-logins';
import { buildSpendPeriods } from '../time/build-spend-periods';
import type { SpendContext } from '../types';
import type { SpendFacts } from './pick-spend-stop';
import { readSpendRaise } from './read-spend-raise';
import { readSpendRouteRaises } from './read-spend-route-raises';
import { readSpendTurns } from './read-spend-turns';
import { takeSettleOrder } from './take-settle-order';

// The gateway's status, the turn count and today's raises, read now. The status is never a cached
// one, because the caller has just seen a request fail or is about to act on the answer.
export async function readSpendFacts(context: SpendContext): Promise<SpendFacts> {
  const order = takeSettleOrder(context);
  const now = context.clock.now();
  const periods = buildSpendPeriods(now, context.zone);
  const db = context.log.writer.db;

  const [status, turns, raise, routeRaises] = await Promise.all([
    context.gateway.readStatus(),
    readSpendTurns(db, { dayMs: periods.day.startMs, monthMs: periods.month.startMs }),
    readSpendRaise(db, periods.day.start),
    readSpendRouteRaises(db, periods.day.start),
    readPlanLogins(context),
  ]);

  return {
    status: status.kind === 'ok' ? status.value : null,
    turns,
    raise,
    routeRaises,
    limits: context.limits,
    now,
    statusAtMs: now,
    order,
    periods,
  };
}
