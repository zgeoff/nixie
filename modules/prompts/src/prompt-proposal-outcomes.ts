import { buildProposalOutcomes } from '@heynixie/proposals';

export const promptProposalOutcomes = buildProposalOutcomes({
  approved: 'prompts.override_approved',
  rejected: 'prompts.override_rejected',
  lapsed: 'prompts.override_lapsed',
});
