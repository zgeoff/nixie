// One read serves at most this many proposals, the host's limit for a read of proposals.
const readLimit = 100;

// The IDs in reads of at most the limit each, in order.
export function collectProposalIDBatches(ids: readonly string[]): string[][] {
  return Array.from({ length: Math.ceil(ids.length / readLimit) }, (_, index) =>
    ids.slice(index * readLimit, (index + 1) * readLimit),
  );
}
