import type { GitHubDefinitionsOptions } from '@heynixie/definitions-github';
import type { DeploymentConfig } from './deployment-config-schema';

// Resolves the definitions repo that nixie exports the skills it wrote to, with its token, or null
// when the configuration names none. The export needs the token, so a secrets file without one
// stops nixie before it opens anything.
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

  return { ...exportConfig, token };
}
