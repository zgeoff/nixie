import type { GitHubDefinitionsOptions } from '@heynixie/definitions-github';
import type { DeploymentConfig } from './deployment-config-schema';

export function resolveDefinitionsExport(
  config: Pick<DeploymentConfig, 'definitions'>,
  token: string | null,
): GitHubDefinitionsOptions | null {
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
    repository: exportConfig.repository,
    base: exportConfig.base,
    apiURL: exportConfig.apiURL,
    token,
  };
}
