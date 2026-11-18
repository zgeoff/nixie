import type { BackupContext } from '../types';
import type { FailedBackupNoticeInput } from './seed-failed-backup-notice';
import { seedFailedBackupNotice } from './seed-failed-backup-notice';
import { seedPublishedBackupSet } from './seed-published-backup-set';

export interface BackupSeederDeps {
  readonly context: BackupContext;
}

export function buildBackupSeeder(deps: BackupSeederDeps) {
  return {
    failedBackupNotice: (input: FailedBackupNoticeInput) =>
      seedFailedBackupNotice(deps.context, input),
    publishedBackupSet: () => seedPublishedBackupSet(deps.context),
  };
}
