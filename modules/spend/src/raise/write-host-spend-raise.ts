import { readSpendFacts } from '../stop/read-spend-facts';
import { readSpendRaise } from '../stop/read-spend-raise';
import { settleSpendStop } from '../stop/settle-spend-stop';
import { buildSpendPeriods } from '../time/build-spend-periods';
import type { SpendContext } from '../types';
import { writeSpendRaiseRecord } from './write-spend-raise-record';

export interface HostRaiseRequest {
  readonly turns: number;
}

export interface HostSpendRaise {
  readonly start: string;
  readonly dollars: number;
  readonly tokens: number;
  readonly turns: number;
}

// The operator's raise of today's turns, which may pass the day's turn cap. The dollars and the
// tokens keep the totals in force, so the raise changes the turns alone.
export async function writeHostSpendRaise(
  context: SpendContext,
  request: HostRaiseRequest,
): Promise<HostSpendRaise> {
  const start = buildSpendPeriods(context.clock.now(), context.zone).day.start;

  const earlier = await readSpendRaise(context.log.writer.db, start);
  const status = await context.gateway.readStatus();

  const limit = status.kind === 'ok' ? status.value.periods.day.limit : null;

  const raise = {
    start,
    dollars: earlier?.dollars ?? limit?.dollars ?? 0,
    tokens: earlier?.tokens ?? limit?.tokens ?? 0,
    turns: request.turns,
  };

  const written = await writeSpendRaiseRecord(context, { ...raise, by: 'host' });
  const facts = await readSpendFacts(context);

  await settleSpendStop(context, facts);

  return written;
}
