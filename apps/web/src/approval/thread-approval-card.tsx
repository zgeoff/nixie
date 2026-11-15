import type { ReactNode } from 'react';
import { use } from 'react';
import { ApprovalCard } from './approval-card';
import { ThreadApprovalsContext } from './thread-approvals-context';

export interface ThreadApprovalCardProps {
  readonly proposalID: string;
}

// The card of a proposal, at the record that created it.
export function ThreadApprovalCard(props: ThreadApprovalCardProps): ReactNode {
  const approvals = use(ThreadApprovalsContext);
  const item = approvals?.reads.get(props.proposalID);

  if (approvals === undefined || item === undefined) {
    return null;
  }

  return (
    <li>
      <ApprovalCard defer={approvals.defer} item={item} onRefresh={approvals.refresh} />
    </li>
  );
}
