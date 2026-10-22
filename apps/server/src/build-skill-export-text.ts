import type { SkillExportText } from '@heynixie/definitions';
import type { DeploymentConfig } from './deployment-config-schema';

export function buildSkillExportText(
  config: Pick<DeploymentConfig, 'definitions' | 'agent' | 'owner'>,
): SkillExportText {
  return {
    title: config.definitions.export?.title ?? null,
    message: config.definitions.export?.message ?? null,
    agentName: config.agent.names[0] ?? null,
    ownerName: config.owner.name,
  };
}
