import type { ForgetStatus } from '@heynixie/memory';
import type { ForgetProgress } from './types';

// An item that no forget took, or whose cleanup still runs, keeps its key in the live store, so no
// backup set can have pruned it yet.
export function pickForgetProgress(
  itemIDs: readonly string[],
  status: ForgetStatus,
): ForgetProgress {
  if (status.deleted.length < itemIDs.length) {
    return { stage: 'deleting' };
  }

  return { stage: 'forgotten', sequence: status.forgottenSequence };
}
