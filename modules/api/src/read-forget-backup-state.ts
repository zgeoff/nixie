import { readForgetBackup } from '@heynixie/backup';
import type { ForgetStatus } from '@heynixie/memory';
import type { APIContext, ForgetBackupState } from './types';

type ForgetProgress = Pick<ForgetStatus, 'pending' | 'forgottenSequence'>;

// A forget writes its closing record only after its local cleanup, so no backup set covers an item
// that still waits on that cleanup. A forget that deleted nothing leaves no key to prune.
export function readForgetBackupState(
  context: APIContext,
  progress: ForgetProgress,
): Promise<ForgetBackupState> {
  if (!context.settings.isBackupEnabled) {
    return Promise.resolve({ state: 'off' });
  }

  if (progress.pending.length > 0) {
    return Promise.resolve({ state: 'pending' });
  }

  if (progress.forgottenSequence === null) {
    return Promise.resolve({ state: 'complete' });
  }

  return readForgetBackup(context.log.writer, progress.forgottenSequence);
}
