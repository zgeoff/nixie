import type { ListedStatus } from '../connection/pick-connection-status';
import type { AttentionStatus } from './types';

// The status that the model hears of, or null for `active` and `forgotten`.
export function pickAttentionStatus(status: ListedStatus): AttentionStatus | null {
  return status === 'active' || status === 'forgotten' ? null : status;
}
