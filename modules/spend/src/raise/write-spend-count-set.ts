import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { spendCountSetCodec } from '../record/spend-count-set-codec';
import { readSpendFacts } from '../stop/read-spend-facts';
import { settleSpendStop } from '../stop/settle-spend-stop';
import type { GatewayStatus, LimitTarget, PeriodName, SpendContext } from '../types';

export interface SpendCountSetRequest {
  readonly target: LimitTarget;
  readonly period: PeriodName;

  // the ISO date of the period's first day, in the gateway's zone
  readonly start: string;
  readonly dollars: number;
  readonly by: string;
}

export type SpendCountSetResult =
  | { readonly state: 'clear' }
  | { readonly state: 'stopped' }
  | { readonly error: 'period_ended' }
  | { readonly error: 'unknown_route' }
  | { readonly error: 'unknown_provider' }
  | { readonly error: 'unreachable' };

// A person's correction of one period's count, such as a reset to zero. It tells the gateway, records
// the old and new dollars once the gateway took it, and settles the stops. A gateway that does not
// answer changes nothing.
export async function writeSpendCountSet(
  context: SpendContext,
  request: SpendCountSetRequest,
): Promise<SpendCountSetResult> {
  const read = await context.gateway.readStatus();

  if (read.kind !== 'ok') {
    return { error: 'unreachable' };
  }

  const before = pickPeriodDollars(read.value, request);

  if (before === null) {
    return { error: request.target.kind === 'route' ? 'unknown_route' : 'unknown_provider' };
  }

  const posted = await context.gateway.postCount({
    target: request.target,
    period: request.period,
    start: request.start,
    dollars: request.dollars,
  });

  if (posted.kind === 'unreachable') {
    return { error: 'unreachable' };
  }

  if (posted.kind === 'not_found') {
    return { error: request.target.kind === 'route' ? 'unknown_route' : 'unknown_provider' };
  }

  if (posted.kind === 'period_ended') {
    return { error: 'period_ended' };
  }

  await writeCountSetRecord(context, request, before);

  const facts = await readSpendFacts(context);
  const stop = await settleSpendStop(context, { ...facts, roomReason: 'corrected' });

  const isLimitTripped =
    facts.status !== null &&
    [...Object.values(facts.status.routes), ...Object.values(facts.status.providers)].some(
      (held) => held.day.tripped || held.month.tripped,
    );

  return { state: stop.state === 'clear' && !isLimitTripped ? 'clear' : 'stopped' };
}

// the dollars the period held before the change, or null for a route or provider the status lacks
function pickPeriodDollars(status: GatewayStatus, request: SpendCountSetRequest): number | null {
  const held = request.target.kind === 'route' ? status.routes : status.providers;
  const id = request.target.id;
  const periods = Object.hasOwn(held, id) ? held[id] : undefined;

  return periods === undefined ? null : periods[request.period].dollars;
}

async function writeCountSetRecord(
  context: SpendContext,
  request: SpendCountSetRequest,
  before: number,
): Promise<void> {
  const target =
    request.target.kind === 'route'
      ? { route: request.target.id }
      : { provider: request.target.id };

  await withWriteTransaction(context.log.writer, (tx) =>
    writeRecordsInTransaction(tx, context.log, [
      {
        kind: spendCountSetCodec.kind,
        definitions: context.definitions(),
        payload: spendCountSetCodec.encode({
          ...target,
          period: request.period,
          start: request.start,
          from: before,
          to: request.dollars,
          by: request.by,
        }),
      },
    ]),
  );
}
