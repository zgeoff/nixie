import type { ONNXEncoder } from '@heynixie/encoder-onnx';
import { startONNXEncoder } from '@heynixie/encoder-onnx';
import { makeThresholdLogger } from '@heynixie/logger';
import { loadDeploymentConfig } from './load-deployment-config';
import { loadSandboxManifest } from './load-sandbox-manifest';
import { loadSecrets } from './load-secrets';
import { resolveDefinitionsExport } from './resolve-definitions-export';
import { resolveOwnerConfig } from './resolve-owner-config';
import { resolveSandboxSettings } from './resolve-sandbox-settings';
import type { ServerOptions, ServerPartsOptions } from './start-server';

export type ServerInputs = Pick<
  ServerPartsOptions,
  'config' | 'secrets' | 'images' | 'sandbox' | 'definitionsExport' | 'log'
> & {
  // the encoder, which the server stops with its other parts, or null for keyword search alone
  readonly encoder: ONNXEncoder | null;
};

// Loads what the server starts from, and refuses an invalid configuration, secrets file, sandbox
// manifest or encoder model before the server opens anything. From the configuration on, the server
// logs only the events at the configured level or above it.
export async function loadServerInputs(options: ServerOptions): Promise<ServerInputs> {
  const loaded = await loadDeploymentConfig(options.configPath);

  const secrets = await loadSecrets({
    path: loaded.server.secretsFile,
    sopsArgv: options.sopsArgv,
  });

  const config = { ...loaded, owner: resolveOwnerConfig(loaded.owner, secrets.settings) };
  const sandbox = resolveSandboxSettings(loaded, secrets.impdToken);
  const definitionsExport = resolveDefinitionsExport(loaded, secrets.definitionsExportToken);

  const images = await loadSandboxManifest(options.manifestPath);

  // the model loads from the local folder alone, and a missing file stops the start rather than
  // leaving memory search on keywords for the life of the process
  const encoder =
    options.encoderDir === undefined ? null : await startONNXEncoder(options.encoderDir);

  return {
    config,
    secrets,
    images,
    sandbox,
    definitionsExport,
    log: makeThresholdLogger(options.log, loaded.server.logLevel),
    encoder,
  };
}
