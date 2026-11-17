import { readSpendFacts } from '../stop/read-spend-facts';
import { readSpendRaise } from '../stop/read-spend-raise';
import { settleSpendStop } from '../stop/settle-spend-stop';
import type { SpendContext, SpendTriple } from '../types';
import type { RaiseRequest } from './pick-raise-refusal';
import { pickRaiseRefusal } from './pick-raise-refusal';
import { writeSpendRaiseRecord } from './write-spend-raise-record';

export type SpendRaiseResult =
  | { readonly state: 'clear' }
  | { readonly state: 'stopped' }
  | { readonly error: 'above_cap'; readonly cap: SpendTriple }
  | { readonly error: 'period_ended' }
  | { readonly error: 'unreachable' };

// Your raise of today's limits, confirmed once in the client: it checks the caps, writes the record,
// tells the gateway, and clears the stop when the raise lifts it. It never lowers a total that an
// earlier raise set, such as the turns that the host command set above the turn cap.
export async function writeSpendRaise(
  context: SpendContext,
  request: RaiseRequest & { readonly by: string },
): Promise<SpendRaiseResult> {
  const status = await context.gateway.readStatus();

  if (status.kind !== 'ok') {
    return { error: 'unreachable' };
  }

  const refusal = pickRaiseRefusal(status.value.periods.day, context.limits, request);

  if (refusal !== null) {
    return refusal;
  }

  const earlier = await readSpendRaise(context.log.writer.db, request.start);

  await writeSpendRaiseRecord(context, {
    start: request.start,
    by: request.by,
    dollars: Math.max(request.dollars, earlier?.dollars ?? 0),
    tokens: Math.max(request.tokens, earlier?.tokens ?? 0),
    turns: Math.max(request.turns, earlier?.turns ?? 0),
  });

  const posted = await context.gateway.postRaise({
    start: request.start,
    limit: { dollars: request.dollars, tokens: request.tokens },
  });

  if (posted.kind === 'above_cap') {
    return {
      error: 'above_cap',
      cap: {
        dollars: posted.cap.dollars,
        tokens: posted.cap.tokens,
        turns: context.limits.dayTurnCap,
      },
    };
  }

  if (posted.kind !== 'ok') {
    return { error: posted.kind };
  }

  const facts = await readSpendFacts(context);
  const stop = await settleSpendStop(context, { ...facts, status: posted.value });

  return { state: stop.state === 'clear' ? 'clear' : 'stopped' };
}
