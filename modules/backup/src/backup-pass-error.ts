import type { BackupPass } from './run-backup-pass';

export class BackupPassError extends Error {
  readonly pass: BackupPass;

  readonly failures: readonly unknown[];

  constructor(pass: BackupPass, failures: readonly [unknown, ...unknown[]]) {
    super('the backup pass recorded its receipts, then failed', { cause: failures[0] });

    this.name = 'BackupPassError';
    this.pass = pass;
    this.failures = failures;
  }
}
