import type { BackupPass } from './run-backup-pass';

export class BackupPassError extends Error {
  readonly pass: BackupPass;

  constructor(pass: BackupPass, cause: unknown) {
    super('the backup pass recorded its receipts, then failed', { cause });

    this.name = 'BackupPassError';
    this.pass = pass;
  }
}
