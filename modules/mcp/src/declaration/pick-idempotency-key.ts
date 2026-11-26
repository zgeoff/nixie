import type { McpReconcile } from '@heynixie/policy';

// The argument the proxy fills with the action ID, or null when the declaration names none.
export function pickIdempotencyKey(reconcile: McpReconcile | null): string | null {
  return reconcile !== null && 'idempotencyKey' in reconcile ? reconcile.idempotencyKey : null;
}
