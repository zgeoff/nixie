import { buildProposalOutcomes } from '@heynixie/proposals';

export const skillProposalOutcomes = buildProposalOutcomes({
  approved: 'skills.write_approved',
  rejected: 'skills.write_rejected',
  lapsed: 'skills.write_lapsed',
});
