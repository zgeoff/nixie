import type { AdapterReply } from '@heynixie/coding';
import type { z } from 'zod';
import type { ATCOutcome } from './make-atc-caller';
import { pickATCReply } from './pick-atc-reply';

export interface ReplyContext {
  readonly tool: string;

  // the call sent an idempotency key
  readonly isKeyed: boolean;
}

// An atc answer as the reply that the action queue takes. An answer that does not parse after a
// keyed call may have run, so it gives the unknown outcome.
export function toReply<Value>(
  outcome: ATCOutcome,
  schema: z.ZodType<Value>,
  context: ReplyContext,
): AdapterReply<Value> {
  if (outcome.status === 'failed') {
    return pickATCReply({ code: outcome.code, tool: context.tool, isKeyed: context.isKeyed });
  }

  if (outcome.status !== 'ok') {
    return outcome;
  }

  const parsed = schema.safeParse(outcome.data);

  if (parsed.success) {
    return { status: 'ok', value: parsed.data };
  }

  return context.isKeyed
    ? { status: 'unknown', reason: 'bad_answer' }
    : { status: 'refused', canClear: false, reason: 'bad_answer' };
}
