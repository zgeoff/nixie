import type { z } from 'zod';
import type { controlRoutes } from './harness/control-routes';

type ListedProposal = z.output<typeof controlRoutes.actionProposals.output>['proposals'][number];

interface ExpectedProposal {
  readonly tool: string;
  readonly waiting: 'pending' | 'none';
}

// `pending` expects one held call of the tool to wait for an answer, and `none` expects no call of
// it to wait any longer.
export function pickProposalRefusal(
  proposals: readonly ListedProposal[],
  expected: ExpectedProposal,
): string | null {
  const count = proposals.filter((proposal) => proposal.tool === expected.tool).length;

  if (expected.waiting === 'pending' && count !== 1) {
    return `held calls of ${expected.tool} that wait for an answer: ${count}, not 1`;
  }

  if (expected.waiting === 'none' && count !== 0) {
    return `held calls of ${expected.tool} that wait for an answer: ${count}, not 0`;
  }

  return null;
}
