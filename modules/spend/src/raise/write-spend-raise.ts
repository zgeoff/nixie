import { readPlanLogins } from '../login/read-plan-logins';
import { readSpendFacts } from '../stop/read-spend-facts';
import { readSpendProviderRaises } from '../stop/read-spend-provider-raises';
import { readSpendRouteRaises } from '../stop/read-spend-route-raises';
import { settleSpendStop } from '../stop/settle-spend-stop';
import { takeSettleOrder } from '../stop/take-settle-order';
import type { SpendContext } from '../types';
import type { RaiseRequest } from './pick-raise-refusal';
import { pickRaiseRefusal } from './pick-raise-refusal';
import { writeSpendRaiseRecord } from './write-spend-raise-record';

export type SpendRaiseResult =
  | { readonly state: 'clear' }
  | { readonly state: 'stopped' }
  | {
      readonly error: 'above_cap';
      readonly measure: 'dollars' | 'turns';
      readonly route: string | null;
      readonly provider: string | null;
      readonly cap: number;
    }
  | { readonly error: 'period_ended' }
  | { readonly error: 'unknown_route' }
  | { readonly error: 'unknown_provider' }
  | { readonly error: 'no_route_limit'; readonly route: string }
  | { readonly error: 'unreachable' }
  | { readonly error: 'unanswered' };

// Your raise of today's limits, confirmed once in the client: it checks the caps, tells the gateway
// of a route's dollars, writes the record unless the gateway refused it, and clears the stops that
// the raise lifts. It never lowers a total that an earlier raise set. `unreachable` writes nothing.
export async function writeSpendRaise(
  context: SpendContext,
  request: RaiseRequest & { readonly by: string },
): Promise<SpendRaiseResult> {
  // The status it settles comes from a request sent after this place, so a settle that a newer read
  // made never comes undone by it.
  const order = takeSettleOrder(context);
  const readAtMs = context.clock.now();

  const [status] = await Promise.all([context.gateway.readStatus(), readPlanLogins(context)]);

  if (status.kind !== 'ok') {
    return { error: 'unreachable' };
  }

  const refusal = pickRaiseRefusal(status.value, context.limits, request);

  if (refusal !== null) {
    return refusal;
  }

  const postedAtMs = context.clock.now();

  const posted = await postDollarsRaise(context, request);

  if (posted !== null && posted.kind !== 'ok' && posted.kind !== 'unreachable') {
    return renderPostedRefusal(posted, request);
  }

  // A raise the gateway refused never stands, because the turns it holds would lift the turn limit
  // that only nixie counts. One that went unanswered stands, for the watcher to send again.
  await writeSpendRaiseRecord(context, request);

  if (posted?.kind === 'unreachable') {
    return { error: 'unanswered' };
  }

  const facts = await readSpendFacts(context);

  const after = posted?.kind === 'ok' ? posted.value : status.value;
  const statusAtMs = posted?.kind === 'ok' ? postedAtMs : readAtMs;

  const stop = await settleSpendStop(context, { ...facts, status: after, statusAtMs, order });

  const isLimitTripped = [...Object.values(after.routes), ...Object.values(after.providers)].some(
    (held) => held.day.tripped || held.month.tripped,
  );

  return { state: stop.state === 'clear' && !isLimitTripped ? 'clear' : 'stopped' };
}

async function postDollarsRaise(context: SpendContext, request: RaiseRequest) {
  if (request.dollars === undefined) {
    return null;
  }

  const db = context.log.writer.db;

  if (request.route !== undefined) {
    const earlier = await readSpendRouteRaises(db, request.start);

    return context.gateway.postRaise({
      target: { kind: 'route', id: request.route },
      start: request.start,
      dollars: Math.max(request.dollars, earlier[request.route] ?? 0),
    });
  }

  if (request.provider === undefined) {
    return null;
  }

  const earlier = await readSpendProviderRaises(db, request.start);

  return context.gateway.postRaise({
    target: { kind: 'provider', id: request.provider },
    start: request.start,
    dollars: Math.max(request.dollars, earlier[request.provider] ?? 0),
  });
}

type Posted = NonNullable<Awaited<ReturnType<typeof postDollarsRaise>>>;

function renderPostedRefusal(
  posted: Exclude<Posted, { readonly kind: 'ok' | 'unreachable' }>,
  request: RaiseRequest,
): SpendRaiseResult {
  if (posted.kind === 'above_cap') {
    return {
      error: 'above_cap',
      measure: 'dollars',
      route: posted.route,
      provider: posted.provider,
      cap: posted.cap,
    };
  }

  if (posted.kind === 'no_route_limit') {
    return { error: 'no_route_limit', route: posted.route };
  }

  if (posted.kind === 'not_found') {
    return { error: request.provider === undefined ? 'unknown_route' : 'unknown_provider' };
  }

  return { error: posted.kind };
}
