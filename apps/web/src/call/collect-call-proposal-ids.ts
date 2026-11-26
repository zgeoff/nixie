// the part of a listed approval that the collection reads
interface ListedProposal {
  readonly proposal: { readonly proposalID: string; readonly thread: string | null };
}

// the most settled proposals the collection keeps beside the open ones
const settledLimit = 100;

// The proposal IDs seen so far, with the listed ones on the call's thread added in order. A proposal
// that left the list has settled, and only the newest settled ones stay past the limit, so a card
// that is still open is never dropped.
export function collectCallProposalIDs(
  seenIDs: readonly string[],
  listed: readonly ListedProposal[],
  thread: string,
): readonly string[] {
  const open = new Set<string>();

  for (const item of listed) {
    if (item.proposal.thread === thread) {
      open.add(item.proposal.proposalID);
    }
  }

  const ids = new Set([...seenIDs, ...open]);

  const settled = [...ids].filter((id) => !open.has(id)).slice(-settledLimit);

  const kept = new Set(settled);

  return [...ids].filter((id) => open.has(id) || kept.has(id));
}
