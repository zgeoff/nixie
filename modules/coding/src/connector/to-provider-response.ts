import type { ProviderResponse } from '@heynixie/connectors';
import type { JSONObject } from '@heynixie/log';
import { match } from 'ts-pattern';
import type { AdapterReply } from '../types';

// What the action queue reads of an adapter's reply: a success with its result, a refusal that
// the queue tries again or fails at once, or an ambiguity that it reconciles.
export function toProviderResponse<Value>(
  reply: AdapterReply<Value>,
  toResult: (value: Value) => JSONObject,
): ProviderResponse {
  return match(reply)
    .returnType<ProviderResponse>()
    .with({ status: 'ok' }, (ok) => ({ kind: 'success', result: toResult(ok.value) }))
    .with({ status: 'refused', canClear: true }, (refused) => ({
      kind: 'refused_retryable',
      reason: refused.reason,
    }))
    .with({ status: 'refused' }, (refused) => ({ kind: 'refused', reason: refused.reason }))
    .with({ status: 'unknown' }, (unknown) => ({ kind: 'ambiguous', reason: unknown.reason }))
    .exhaustive();
}
