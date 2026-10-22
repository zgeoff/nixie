import type { SkillExportText } from '@heynixie/definitions';
import type { GitHubDefinitionsOptions } from '@heynixie/definitions-github';
import type { DeploymentConfig } from './deployment-config-schema';

export interface DefinitionsExportSettings {
  readonly repo: GitHubDefinitionsOptions;
  readonly text: SkillExportText;
}

export function resolveDefinitionsExport(
  config: Pick<DeploymentConfig, 'definitions' | 'agent' | 'owner'>,
  token: string | null,
): DefinitionsExportSettings | null {
  const exportConfig = config.definitions.export;

  if (exportConfig === undefined) {
    return null;
  }

  if (token === null) {
    throw new Error(
      'the secrets file holds no definitions_export_token, and definitions.export needs it',
    );
  }

  return {
    repo: {
      repository: exportConfig.repository,
      base: exportConfig.base,
      apiURL: exportConfig.apiURL,
      token,
    },
    text: {
      title: exportConfig.title,
      message: exportConfig.message,
      agentName: config.agent.names[0] ?? null,
      ownerName: config.owner.name,
    },
  };
}
