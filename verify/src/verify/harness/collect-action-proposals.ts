interface ListedProposal {
  readonly proposal: { readonly proposalID: string; readonly kind: string };
}

interface ReadRecord {
  readonly kind: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface HeldActionProposal {
  readonly proposalID: string;
  readonly tool: string;
}

// The held calls among the listed proposals, each with its tool, which the ask's own record holds:
// the shared record that opens the row comes first and carries no tool.
export function collectActionProposals(
  items: readonly ListedProposal[],
  records: readonly ReadRecord[],
): HeldActionProposal[] {
  return items.flatMap((item) => {
    if (item.proposal.kind !== 'action') {
      return [];
    }

    const asked = records.find(
      (record) =>
        record.kind === 'policy.action_proposed' &&
        record.payload['proposalID'] === item.proposal.proposalID,
    );

    const tool = asked?.payload['tool'];

    return typeof tool === 'string' ? [{ proposalID: item.proposal.proposalID, tool }] : [];
  });
}
