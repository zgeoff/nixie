import type { ImageForgetTarget } from '@heynixie/connectors';
import { readForgetBackupState } from '../forget/read-forget-backup-state';
import { readRecordForgetProgress } from '../record/read-record-forget-progress';
import type { APIContext, ForgetBackupState } from '../types';
import { pickImageForgetBackup } from './pick-image-forget-backup';

// The backup state of the records' forgets, after their cleanups ran.
export async function readImageForgetBackup(
  context: APIContext,
  targets: readonly ImageForgetTarget[],
): Promise<ForgetBackupState> {
  const states = await Promise.all(
    targets.map(async (target) => {
      const progress = await readRecordForgetProgress(context, target.sequence);

      return readForgetBackupState(context, progress);
    }),
  );

  return pickImageForgetBackup(states);
}
