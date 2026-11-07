import type { BackupPass } from './run-backup-pass';

export class BackupStageError extends Error {
  readonly pass: BackupPass;

  constructor(pass: BackupPass, cause: unknown) {
    super('the backup pass recorded its receipts and notices, then failed to stage a set', {
      cause,
    });

    this.name = 'BackupStageError';
    this.pass = pass;
  }
}
