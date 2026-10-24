import type { Transaction } from 'kysely';
import { canMovePromptApproval } from './can-move-prompt-approval';
import { PromptApprovalStateError } from './prompt-approval-state-error';
import type { PromptApprovalState, PromptsTables } from './types';

export interface PromptApprovalMove {
  readonly approvalID: string;
  readonly to: PromptApprovalState;
  readonly at: number;
}

export async function writePromptApprovalState(
  tx: Transaction<unknown>,
  move: PromptApprovalMove,
): Promise<void> {
  const tables = tx.$extendTables<PromptsTables>();

  const row = await tables
    .selectFrom('prompt_approvals')
    .select('state')
    .where('approval_id', '=', move.approvalID)
    .executeTakeFirst();

  if (row === undefined || !canMovePromptApproval(row.state, move.to)) {
    throw new PromptApprovalStateError(move.approvalID, row?.state ?? null, move.to);
  }

  await tables
    .updateTable('prompt_approvals')
    .set({ state: move.to, updated_at: move.at })
    .where('approval_id', '=', move.approvalID)
    .execute();
}
