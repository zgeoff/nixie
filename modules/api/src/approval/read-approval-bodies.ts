import type { ProposalBody, ProposalCoreDeps, SharedProposal } from '@heynixie/proposals';
import type { ReadViewMemory } from '../types';
import { toContractProposal } from './to-contract-proposal';

type MemoryBody = ReturnType<typeof toContractProposal>;

// The body of each row, by the kind that owns it. A row whose kind has no handler has no entry,
// and a row whose body is gone maps to null. A memory row carries its proposal too.
export async function readApprovalBodies(
  deps: ProposalCoreDeps,
  readMemory: ReadViewMemory,
  rows: readonly SharedProposal[],
): Promise<ReadonlyMap<string, (ProposalBody & { readonly memory?: MemoryBody }) | null>> {
  const bodies = new Map<string, ProposalBody | null>();

  for (const [family, handler] of deps.handlers) {
    const own = rows.filter((row) => row.family === family);

    for (const [id, body] of await handler.readBodies(deps.log.writer.db, own)) {
      bodies.set(id, body);
    }
  }

  const memory = await readMemoryBodies(readMemory);

  return new Map(
    [...bodies].map(([id, body]) => {
      const proposal = memory.get(id);

      return [
        id,
        body === null ? null : { ...body, ...(proposal === undefined ? {} : { memory: proposal }) },
      ];
    }),
  );
}

async function readMemoryBodies(readMemory: ReadViewMemory) {
  const store = readMemory();

  if (store === null) {
    return new Map<string, MemoryBody>();
  }

  const proposals = await store.view.readProposals();

  return new Map(proposals.map((proposal) => [proposal.proposalID, toContractProposal(proposal)]));
}
