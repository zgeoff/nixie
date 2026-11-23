import type { DefinitionsExportConfig, SkillExportText } from '@heynixie/definitions';
import type { GitHubDefinitionsOptions } from '@heynixie/definitions-repo-github';
import { makeInstallationTokenReader } from '@heynixie/definitions-repo-github';
import type { DeploymentConfig } from '../deployment/deployment-config-schema';

export interface DefinitionsExportSettings {
  readonly repo: GitHubDefinitionsOptions;
  readonly text: SkillExportText;
}

export interface DefinitionsExportSecrets {
  readonly token: string | null;
  readonly appKey: string | null;
}

export function resolveDefinitionsExport(
  config: Pick<DeploymentConfig, 'definitions' | 'agent' | 'owner'>,
  secrets: DefinitionsExportSecrets,
): DefinitionsExportSettings | null {
  const exportConfig = config.definitions.export;

  if (exportConfig === undefined) {
    return null;
  }

  const readToken = pickTokenReader(exportConfig, secrets);

  return {
    repo: {
      repository: exportConfig.repository,
      base: exportConfig.base,
      apiURL: exportConfig.apiURL,
      readToken,
    },
    text: {
      title: exportConfig.title,
      message: exportConfig.message,
      agentName: config.agent.names[0] ?? null,
      ownerName: config.owner.name,
    },
  };
}

function pickTokenReader(
  exportConfig: DefinitionsExportConfig,
  secrets: DefinitionsExportSecrets,
): () => Promise<string> {
  const app = exportConfig.app;

  if (app === null) {
    const token = secrets.token;

    if (token === null) {
      throw new Error(
        'definitions.export names no app, so the secrets file needs definitions_export_token',
      );
    }

    if (secrets.appKey !== null) {
      throw new Error(
        'the secrets file holds definitions_export_app_key, but definitions.export names no app: ' +
          'sign the export in with the token or with the app, not both',
      );
    }

    return () => Promise.resolve(token);
  }

  if (secrets.token !== null) {
    throw new Error(
      'the secrets file holds definitions_export_token, and definitions.export names an app: ' +
        'sign the export in with the token or with the app, not both',
    );
  }

  if (secrets.appKey === null) {
    throw new Error(
      'definitions.export names an app, so the secrets file needs definitions_export_app_key',
    );
  }

  return makeInstallationTokenReader({
    apiURL: exportConfig.apiURL,
    clientID: app.clientID,
    installationID: app.installationID,
    privateKey: secrets.appKey,
    readNowMs: () => Date.now(),
  });
}
