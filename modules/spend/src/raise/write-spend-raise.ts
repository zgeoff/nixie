import { readPlanLogins } from '../login/read-plan-logins';
import { readSpendFacts } from '../stop/read-spend-facts';
import { readSpendRouteRaises } from '../stop/read-spend-route-raises';
import { settleSpendStop } from '../stop/settle-spend-stop';
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
      readonly cap: number;
    }
  | { readonly error: 'period_ended' }
  | { readonly error: 'unknown_route' }
  | { readonly error: 'unreachable' };

// Your raise of today's limits, confirmed once in the client: it checks the caps, tells the gateway
// of a route's dollars, writes the record unless the gateway refused it, and clears the stops that
// the raise lifts. It never lowers a total that an earlier raise set.
export async function writeSpendRaise(
  context: SpendContext,
  request: RaiseRequest & { readonly by: string },
): Promise<SpendRaiseResult> {
  const [status] = await Promise.all([context.gateway.readStatus(), readPlanLogins(context)]);

  if (status.kind !== 'ok') {
    return { error: 'unreachable' };
  }

  const refusal = pickRaiseRefusal(status.value, context.limits, request);

  if (refusal !== null) {
    return refusal;
  }

  const posted = await postRouteRaise(context, request);

  if (posted !== null && posted.kind !== 'ok' && posted.kind !== 'unreachable') {
    return posted.kind === 'above_cap'
      ? { error: 'above_cap', measure: 'dollars', route: posted.route, cap: posted.cap }
      : { error: posted.kind };
  }

  // A raise the gateway refused never stands, because the turns it holds would lift the turn limit
  // that only nixie counts. One that went unanswered stands, for the watcher to send again.
  await writeSpendRaiseRecord(context, request);

  if (posted?.kind === 'unreachable') {
    return { error: 'unreachable' };
  }

  const facts = await readSpendFacts(context);

  const after = posted?.kind === 'ok' ? posted.value : status.value;

  const stop = await settleSpendStop(context, { ...facts, status: after });

  const isRouteTripped = Object.values(after.routes).some(
    (route) => route.day.tripped || route.month.tripped,
  );

  return { state: stop.state === 'clear' && !isRouteTripped ? 'clear' : 'stopped' };
}

async function postRouteRaise(context: SpendContext, request: RaiseRequest) {
  if (request.route === undefined || request.dollars === undefined) {
    return null;
  }

  const earlier = await readSpendRouteRaises(context.log.writer.db, request.start);

  return context.gateway.postRaise({
    route: request.route,
    start: request.start,
    dollars: Math.max(request.dollars, earlier[request.route] ?? 0),
  });
}
