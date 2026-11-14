import type { ProposalChoice, SharedProposal } from './proposal-kind-handler';

const alwaysAllowCauses: ReadonlySet<string> = new Set(['outside_steering', 'no_rule']);

// The host's list for a row. A client offers only these, and the answer path checks them again.
export function pickProposalChoices(
  row: Pick<SharedProposal, 'kind' | 'riskClass' | 'cause' | 'ruleHash'>,
): readonly ProposalChoice[] {
  const isAlwaysAllowable =
    row.kind === 'action' &&
    row.riskClass === 'routine' &&
    alwaysAllowCauses.has(row.cause) &&
    row.ruleHash !== null;

  return isAlwaysAllowable
    ? ['approve', 'always_allow', 'defer', 'decline']
    : ['approve', 'defer', 'decline'];
}
