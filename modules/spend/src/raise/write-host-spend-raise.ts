import { readSpendFacts } from '../stop/read-spend-facts';
import { settleSpendStop } from '../stop/settle-spend-stop';
import { buildSpendPeriods } from '../time/build-spend-periods';
import type { SpendContext } from '../types';
import { writeSpendRaiseRecord } from './write-spend-raise-record';

export interface HostRaiseRequest {
  readonly turns: number;
}

export interface HostSpendRaise {
  readonly start: string;
  readonly turns: number;
}

// The operator's raise of today's turns, which may pass the day's turn cap. A route's dollars rise
// only through the gateway's own host command.
export async function writeHostSpendRaise(
  context: SpendContext,
  request: HostRaiseRequest,
): Promise<HostSpendRaise> {
  const start = buildSpendPeriods(context.clock.now(), context.zone).day.start;

  await writeSpendRaiseRecord(context, { start, turns: request.turns, by: 'host' });

  const facts = await readSpendFacts(context);

  await settleSpendStop(context, facts);

  return { start, turns: request.turns };
}
