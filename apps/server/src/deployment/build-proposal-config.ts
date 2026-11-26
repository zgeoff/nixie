import type { ProposalConfig } from '@heynixie/proposals';
import type { DeploymentConfig } from './deployment-config-schema';

// The days that each family of proposal waits before it lapses, as the config sets them.
export function buildProposalConfig(config: Pick<DeploymentConfig, 'approvals'>): ProposalConfig {
  const days = config.approvals.lapse_days;

  return {
    lapseDays: {
      action: days.action,
      memory: days.memory,
      skill: days.skill,
      rule_change: days.rule_change,
      prompt: days.prompt,
      mcp: days.mcp,
    },
  };
}
