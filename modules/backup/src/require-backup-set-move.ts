import type { BackupSetState } from './types';

// A copy that stops part way leaves a set no job ships, so it is abandoned at the next start; a
// staged set whose directory is gone is abandoned too, because no receipt can reach it.
const backupSetMoves: Readonly<Record<BackupSetState, readonly BackupSetState[]>> = {
  staging: ['staged', 'abandoned'],
  staged: ['published', 'failed', 'abandoned'],
  published: [],
  failed: [],
  abandoned: [],
};

export function requireBackupSetMove(from: BackupSetState, to: BackupSetState): void {
  if (!backupSetMoves[from].includes(to)) {
    throw new Error(
      `a backup set moves from ${from} only to ${backupSetMoves[from].join(' or ') || 'nothing'}, never to ${to}`,
    );
  }
}
