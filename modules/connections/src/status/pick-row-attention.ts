import { pickConnectionStatus } from '../connection/pick-connection-status';
import type { ConnectionRow } from '../types';
import { pickAttentionStatus } from './pick-attention-status';
import type { AttentionStatus } from './types';

// The status the model hears of for a row, or null while the connection works or is forgotten. A row
// the owner disabled is disconnected.
export function pickRowAttention(
  row: Pick<ConnectionRow, 'binding' | 'status' | 'refresh_expires_at'>,
  nowMs: number,
): AttentionStatus | null {
  if (row.binding === 'disabled') {
    return 'disconnected';
  }

  return pickAttentionStatus(
    pickConnectionStatus({
      binding: row.binding,
      status: row.status,
      refreshExpiresAtMs: row.refresh_expires_at,
      nowMs,
    }),
  );
}
