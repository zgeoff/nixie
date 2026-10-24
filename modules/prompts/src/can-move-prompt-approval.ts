import type { PromptApprovalState } from './types';

const transitions: Readonly<Record<PromptApprovalState, readonly PromptApprovalState[]>> = {
  current: ['superseded'],
  superseded: [],
};

export function canMovePromptApproval(from: PromptApprovalState, to: PromptApprovalState): boolean {
  return transitions[from].includes(to);
}
