import { buildSpendPeriods } from '../time/build-spend-periods';
import type { SpendContext } from '../types';
import type { SpendFacts } from './pick-spend-stop';
import { readSpendRaise } from './read-spend-raise';
import { readSpendTurns } from './read-spend-turns';

// The gateway's status, the turn count and today's raise, read now. The status is never a cached
// one, because the caller has just seen a request fail or is about to act on the answer.
export async function readSpendFacts(context: SpendContext): Promise<SpendFacts> {
  const now = context.clock.now();
  const periods = buildSpendPeriods(now, context.zone);
  const db = context.log.writer.db;

  const [status, turns, raise] = await Promise.all([
    context.gateway.readStatus(),
    readSpendTurns(db, { dayMs: periods.day.startMs, monthMs: periods.month.startMs }),
    readSpendRaise(db, periods.day.start),
  ]);

  return {
    status: status.kind === 'ok' ? status.value : null,
    turns,
    raise,
    limits: context.limits,
    now,
  };
}
