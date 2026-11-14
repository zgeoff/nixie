import { mapRuleProposalRecord } from '@heynixie/definitions';
import { mapMemoryProposalRecord } from '@heynixie/memory';
import { mapActionProposalRecord } from '@heynixie/policy';
import { buildProposalsProjection } from '@heynixie/proposals';
import { mapSkillProposalRecord } from '@heynixie/skills';

// The shared row of every proposal kind. It folds after the projections of the kinds.
export const proposalsProjection = buildProposalsProjection([
  mapActionProposalRecord,
  mapMemoryProposalRecord,
  mapSkillProposalRecord,
  mapRuleProposalRecord,
]);
