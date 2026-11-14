import type { BackupContext } from '../types';
import type { FailedBackupNoticeInput } from './seed-failed-backup-notice';
import { seedFailedBackupNotice } from './seed-failed-backup-notice';

export interface BackupSeederDeps {
  readonly context: BackupContext;
}

export function buildBackupSeeder(deps: BackupSeederDeps) {
  return {
    failedBackupNotice: (input: FailedBackupNoticeInput) =>
      seedFailedBackupNotice(deps.context, input),
  };
}
