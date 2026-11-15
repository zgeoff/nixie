import { pickGatedChoices } from './pick-gated-choices';
import { pickProposalChoices } from './pick-proposal-choices';
import type { ProposalChoice, SharedProposal } from './proposal-kind-handler';

// The choices of a row that take the owner's passkey, which a client asks for before it sends one.
export function pickPasskeyChoices(
  row: Pick<SharedProposal, 'kind' | 'riskClass' | 'cause' | 'ruleHash'>,
): readonly ProposalChoice[] {
  return pickGatedChoices(row.riskClass, pickProposalChoices(row));
}
