import { readForgetBackupState } from '../forget/read-forget-backup-state';
import type { APIContext, ForgetProgress } from '../types';

export interface ConnectionForgetState {
  readonly erasure: 'pending' | 'done';
  readonly revocation: 'pending' | 'confirmed' | 'refused' | 'unknown' | 'not_attempted';
  readonly finishedSequence: number | null;
}

// The status of a connection's forget as the contract shows it: erasure, revocation and backup apart.
export async function readContractForgetStatus(context: APIContext, state: ConnectionForgetState) {
  const progress: ForgetProgress =
    state.finishedSequence === null
      ? { stage: 'deleting' }
      : { stage: 'forgotten', sequence: state.finishedSequence };

  return {
    erasure: state.erasure,
    revocation: state.revocation,
    backup: await readForgetBackupState(context, progress),
  };
}
