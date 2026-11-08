import { readForgetBackup } from '@heynixie/backup';
import { P, match } from 'ts-pattern';
import type { APIContext, ForgetBackupState, ForgetProgress } from './types';

// A forget writes its closing record only after its local cleanup, so no backup set covers an item
// that still waits on that cleanup. A forget that deleted nothing leaves no key to prune.
export function readForgetBackupState(
  context: APIContext,
  progress: ForgetProgress,
): Promise<ForgetBackupState> {
  if (!context.settings.isBackupEnabled) {
    return Promise.resolve({ state: 'off' });
  }

  return match(progress)
    .returnType<Promise<ForgetBackupState>>()
    .with({ stage: 'deleting' }, () => Promise.resolve({ state: 'pending' }))
    .with({ stage: 'forgotten', sequence: null }, () => Promise.resolve({ state: 'complete' }))
    .with({ stage: 'forgotten', sequence: P.number }, (forgotten) =>
      readForgetBackup(context.log.writer, forgotten.sequence),
    )
    .exhaustive();
}
