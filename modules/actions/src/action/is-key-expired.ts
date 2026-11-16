import type { ActionConnector } from '@heynixie/connectors';
import type { ActionRow } from '../types';

// A retry after an unknown outcome relies on the provider still keeping the idempotency key.
export function isKeyExpired(
  action: Pick<ActionRow, 'unknown_streak' | 'first_attempt_at'>,
  connector: Pick<ActionConnector, 'reconcile'>,
  now: number,
): boolean {
  const reconcile = connector.reconcile;

  if (reconcile?.kind !== 'idempotency_key' || action.unknown_streak === 0) {
    return false;
  }

  return action.first_attempt_at !== null && now - action.first_attempt_at >= reconcile.keptForMs;
}
