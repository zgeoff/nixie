import type { PromptApprovalState } from './types';

export class PromptApprovalStateError extends Error {
  override readonly name = 'PromptApprovalStateError';

  constructor(approvalID: string, from: PromptApprovalState | null, to: PromptApprovalState) {
    const reason =
      from === null
        ? `no prompt approval ${approvalID} exists to become ${to}`
        : `prompt approval ${approvalID} is ${from}, so it cannot become ${to}`;

    super(reason);
  }
}
