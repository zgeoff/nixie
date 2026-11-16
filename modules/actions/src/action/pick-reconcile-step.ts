import type { Reconcile } from '@heynixie/connectors';
import { defaultTrustNegativeAfterMs } from '@heynixie/connectors';
import type { OwnerReason } from '../types';

// The 3rd unknown in a row goes to the owner whatever the connector declares.
const unknownStreakLimit = 3;

export interface ReconcileFacts {
  readonly reconcile: Reconcile;

  // the unknowns in a row, this one included
  readonly streak: number;
  readonly firstAttemptAt: number | null;
  readonly lastAttemptAt: number | null;
  readonly now: number;

  // whether the connector's retry schedule has another attempt
  readonly hasRetryLeft: boolean;
}

export type ReconcileStep =
  | { readonly kind: 'owner'; readonly ownerReason: OwnerReason }
  | { readonly kind: 'retry'; readonly at: number }
  | { readonly kind: 'check'; readonly at: number };

export function pickReconcileStep(facts: ReconcileFacts): ReconcileStep {
  const reconcile = facts.reconcile;

  if (reconcile.kind === 'none') {
    return { kind: 'owner', ownerReason: 'no_reconcile' };
  }

  if (facts.streak >= unknownStreakLimit || !facts.hasRetryLeft) {
    return { kind: 'owner', ownerReason: 'unknown_streak' };
  }

  if (reconcile.kind === 'check') {
    const trustMs = reconcile.trustNegativeAfterMs ?? defaultTrustNegativeAfterMs;

    return { kind: 'check', at: (facts.lastAttemptAt ?? facts.now) + trustMs };
  }

  const isKept =
    facts.firstAttemptAt !== null && facts.now - facts.firstAttemptAt < reconcile.keptForMs;

  return isKept ? { kind: 'retry', at: facts.now } : { kind: 'owner', ownerReason: 'key_expired' };
}
