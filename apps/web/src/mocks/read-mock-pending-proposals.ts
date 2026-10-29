import { isMockItemShredded } from './is-mock-item-shredded';
import { store } from './store';

export function readMockPendingProposals() {
  const pending = store.memoryProposals.findMany(
    (query) =>
      query.where(
        (proposal) =>
          proposal.status === 'pending' &&
          proposal.lapseAt.getTime() > Date.now() &&
          !hasShreddedItem(proposal.itemID),
      ),
    { orderBy: { createdAt: 'asc' } },
  );

  return pending.map((proposal) => ({
    actionHash: proposal.actionHash,
    createdAt: proposal.createdAt,
    evidence: proposal.evidence === null ? null : structuredClone(proposal.evidence),
    image: proposal.image === null ? null : { ...proposal.image },
    isPinned: proposal.isPinned,
    isSensitive: proposal.isSensitive,
    itemID: proposal.itemID,
    kind: proposal.subject === 'self' ? ('self' as const) : ('fact' as const),
    lapseAt: proposal.lapseAt,
    newSubject: proposal.newSubject,
    operation: proposal.operation,
    origin: proposal.origin,
    proposalID: proposal.proposalID,
    quote: proposal.quote,
    reason: proposal.reason,
    source: proposal.source,
    sources: [{ origin: proposal.origin, proposedAt: proposal.createdAt, thread: proposal.thread }],
    subject: proposal.subject,
    targetVersion: proposal.targetVersion,
    text: proposal.text,
    until: proposal.until,
  }));
}

function hasShreddedItem(itemID: string): boolean {
  const item = store.memoryItems.findFirst((query) => query.where({ itemID }));

  return item !== undefined && isMockItemShredded(item);
}
