import { makeThresholdLogger } from '@heynixie/ops';
import { loadDeploymentConfig } from './load-deployment-config';
import { loadSandboxManifest } from './load-sandbox-manifest';
import { loadSecrets } from './load-secrets';
import { resolveOwnerConfig } from './resolve-owner-config';
import { resolveSandboxSettings } from './resolve-sandbox-settings';
import type { ServerOptions, ServerPartsOptions } from './start-server';

export type ServerInputs = Pick<
  ServerPartsOptions,
  'config' | 'secrets' | 'images' | 'sandbox' | 'log'
>;

// Loads what the server starts from, and refuses an invalid configuration, secrets file or sandbox
// manifest before the server opens anything. From the configuration on, the server logs only the
// events at the configured level or above it.
export async function loadServerInputs(options: ServerOptions): Promise<ServerInputs> {
  const loaded = await loadDeploymentConfig(options.configPath);

  const secrets = await loadSecrets({
    path: loaded.server.secretsFile,
    sopsArgv: options.sopsArgv,
  });

  const config = { ...loaded, owner: resolveOwnerConfig(loaded.owner, secrets.settings) };
  const sandbox = resolveSandboxSettings(loaded, secrets.impdToken);

  const images = await loadSandboxManifest(options.manifestPath);

  return {
    config,
    secrets,
    images,
    sandbox,
    log: makeThresholdLogger(options.log, loaded.server.logLevel),
  };
}
