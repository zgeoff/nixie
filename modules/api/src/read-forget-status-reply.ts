import type { ForgetStatus } from '@heynixie/memory';
import { pickForgetProgress } from './pick-forget-progress';
import { readForgetBackupState } from './read-forget-backup-state';
import type { APIContext, ForgetBackupState } from './types';

interface ForgetStatusReply {
  readonly deleted: string[];
  readonly pending: string[];
  readonly backup: ForgetBackupState;
}

export async function readForgetStatusReply(
  context: APIContext,
  itemIDs: readonly string[],
  status: ForgetStatus,
): Promise<ForgetStatusReply> {
  return {
    deleted: [...status.deleted],
    pending: [...status.pending],
    backup: await readForgetBackupState(context, pickForgetProgress(itemIDs, status)),
  };
}
