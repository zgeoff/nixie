import type { CheckResponse, Reconcile } from '@heynixie/connectors';
import type { JSONObject } from '@heynixie/log';
import type { CheckAnswer, OwnerReason } from '../types';

export type CheckStep =
  | { readonly kind: 'done'; readonly answer: CheckAnswer; readonly result: JSONObject }
  | { readonly kind: 'retry'; readonly answer: CheckAnswer }
  | { readonly kind: 'owner'; readonly answer: CheckAnswer; readonly ownerReason: OwnerReason };

export interface CheckFacts {
  readonly reconcile: Reconcile | undefined;
  readonly hasRetryLeft: boolean;
}

// What an answer of a check does to the action: found settles it, not found retries unless the
// connector asks the owner, and an inconclusive answer asks the owner.
export function pickCheckStep(response: CheckResponse, facts: CheckFacts): CheckStep {
  if (response.kind === 'found') {
    return { kind: 'done', answer: 'found', result: response.result };
  }

  if (response.kind === 'inconclusive') {
    return { kind: 'owner', answer: 'inconclusive', ownerReason: 'inconclusive' };
  }

  if (facts.reconcile?.kind === 'check' && facts.reconcile.onNotFound === 'ask') {
    return { kind: 'owner', answer: 'not_found', ownerReason: 'not_found_ask' };
  }

  return facts.hasRetryLeft
    ? { kind: 'retry', answer: 'not_found' }
    : { kind: 'owner', answer: 'not_found', ownerReason: 'unknown_streak' };
}
