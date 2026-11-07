import { backupReceiptSchema, parseBackupFile } from '@heynixie/wire';
import type { BackupSetState } from './types';

export type ForgetBackup =
  | { readonly state: 'pending' }
  | { readonly state: 'failed'; readonly failure: string }
  | { readonly state: 'complete' };

export interface ForgetCoveringSet {
  readonly state: BackupSetState;
  readonly receipt: string | null;
}

// A published set prunes every older key snapshot, so one is enough even when a newer set failed.
// A failed set leaves the forget open: the next scheduled set covers it again.
export function pickForgetBackup(newestFirst: readonly ForgetCoveringSet[]): ForgetBackup {
  if (newestFirst.some((set) => set.state === 'published')) {
    return { state: 'complete' };
  }

  const newest = newestFirst.find((set) => set.state !== 'abandoned');

  if (newest?.state !== 'failed') {
    return { state: 'pending' };
  }

  return { state: 'failed', failure: parseSetFailure(newest.receipt) };
}

function parseSetFailure(receipt: string | null): string {
  const parsed = parseBackupFile(receipt ?? '', backupReceiptSchema);

  if ('refused' in parsed) {
    return `nixie refused the set's receipt: ${parsed.refused}`;
  }

  return parsed.value.failure ?? "nixie refused the set's receipt: it names another set";
}
