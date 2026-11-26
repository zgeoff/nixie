import {
  mapMandateRecord,
  mapProposedRuleRecord,
  mapRuleProposalRecord,
} from '@heynixie/definitions';
import { mapMcpProposalRecord } from '@heynixie/mcp';
import { mapMemoryProposalRecord } from '@heynixie/memory';
import { mapActionProposalRecord } from '@heynixie/policy';
import { mapPromptProposalRecord } from '@heynixie/prompts';
import { buildProposalsProjection } from '@heynixie/proposals';
import { mapSkillProposalRecord } from '@heynixie/skills';

// The shared row of every proposal kind. It folds after the projections of the kinds.
export const proposalsProjection = buildProposalsProjection([
  mapActionProposalRecord,
  mapMemoryProposalRecord,
  mapSkillProposalRecord,
  mapRuleProposalRecord,
  mapProposedRuleRecord,
  mapMandateRecord,
  mapMcpProposalRecord,
  mapPromptProposalRecord,
]);
