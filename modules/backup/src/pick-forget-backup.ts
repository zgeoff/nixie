import { backupReceiptSchema, parseBackupFile } from '@heynixie/wire';
import invariant from 'tiny-invariant';
import type { BackupSetState } from './types';

export type ForgetBackup =
  | { readonly state: 'pending' }
  | { readonly state: 'failed'; readonly failure: string }
  | { readonly state: 'complete' };

export interface ForgetCoveringSet {
  readonly sequence: number;
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

  return { state: 'failed', failure: parseSetFailure(newest) };
}

function parseSetFailure(set: ForgetCoveringSet): string {
  const receipt = set.receipt;

  invariant(receipt !== null, `failed backup set ${String(set.sequence)} keeps its receipt`);

  const parsed = parseBackupFile(receipt, backupReceiptSchema);

  if ('refused' in parsed) {
    return `nixie refused the set's receipt: ${parsed.refused}`;
  }

  if (parsed.value.sequence !== set.sequence) {
    return `nixie refused the set's receipt: it names set ${String(parsed.value.sequence)}`;
  }

  const failure = parsed.value.failure;

  invariant(failure !== null, `failed backup set ${String(set.sequence)} has a failed receipt`);

  return failure;
}
