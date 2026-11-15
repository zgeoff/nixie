import type { ProposalChoice, SharedProposal } from './proposal-kind-handler';

const gatedChoices: ReadonlySet<ProposalChoice> = new Set(['approve', 'always_allow']);

// The choices of a row that take the owner's passkey: an approval of a high-risk proposal. Defer and
// decline never take one, and a routine row never does. A later row that offers always allow on a
// high-risk proposal takes the passkey with no further change.
export function pickGatedChoices(
  riskClass: SharedProposal['riskClass'],
  choices: readonly ProposalChoice[],
): readonly ProposalChoice[] {
  return riskClass === 'routine' ? [] : choices.filter((choice) => gatedChoices.has(choice));
}
