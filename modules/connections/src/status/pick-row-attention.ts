import { pickConnectionStatus } from '../connection/pick-connection-status';
import type { ConnectionRow } from '../types';
import { pickAttentionStatus } from './pick-attention-status';
import type { AttentionStatus } from './types';

// The status the model hears of for a row, or null while the connection works or is forgotten.
export function pickRowAttention(
  row: Pick<ConnectionRow, 'binding' | 'status' | 'refresh_expires_at'>,
  nowMs: number,
): AttentionStatus | null {
  return pickAttentionStatus(
    pickConnectionStatus({
      binding: row.binding,
      status: row.status,
      refreshExpiresAtMs: row.refresh_expires_at,
      nowMs,
    }),
  );
}
