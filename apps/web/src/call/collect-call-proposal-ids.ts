// the part of a listed approval that the collection reads
interface ListedProposal {
  readonly proposal: { readonly proposalID: string; readonly thread: string | null };
}

// the most proposals one read takes
const readLimit = 100;

// The proposal IDs the call screen has seen so far, with those of the listed proposals that sit on
// the call's thread added in the order they come. Another thread's proposal never joins.
export function collectCallProposalIDs(
  seenIDs: readonly string[],
  listed: readonly ListedProposal[],
  thread: string,
): readonly string[] {
  const ids = new Set(seenIDs);

  for (const item of listed) {
    if (item.proposal.thread === thread) {
      ids.add(item.proposal.proposalID);
    }
  }

  return [...ids].slice(-readLimit);
}
