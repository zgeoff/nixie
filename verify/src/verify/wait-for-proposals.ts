import { WringerError } from '@wringer/core';
import { pickProposalRefusal } from './pick-proposal-refusal';

type ListedProposals = Parameters<typeof pickProposalRefusal>[0];

interface ProposalWait {
  readonly tool: string;
  readonly waiting: 'pending' | 'none';
  readonly waitMs?: number | undefined;
}

// Lists the held calls until they match, and fails with `check-failed` when they do not in time.
// With no `waitMs` it checks once.
export async function waitForProposals<Listed extends { readonly proposals: ListedProposals }>(
  listProposals: () => Promise<Listed>,
  wait: ProposalWait,
): Promise<Listed> {
  const deadline = Date.now() + (wait.waitMs ?? 0);

  for (;;) {
    const listed = await listProposals();

    const refusal = pickProposalRefusal(listed.proposals, wait);

    if (refusal === null) {
      return listed;
    }

    if (Date.now() >= deadline) {
      throw new WringerError('check-failed', { message: refusal, data: listed });
    }

    await Bun.sleep(200);
  }
}
