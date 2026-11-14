import type { ONNXEncoder } from '@heynixie/encoder-onnx';
import { startONNXEncoder } from '@heynixie/encoder-onnx';
import { makeThresholdLogger } from '@heynixie/logger';
import { listImageNeeds } from './list-image-needs';
import { loadDeploymentConfig } from './load-deployment-config';
import { loadSandboxManifest } from './load-sandbox-manifest';
import { loadSecrets } from './load-secrets';
import { pickNeededImages } from './pick-needed-images';
import { resolveDefinitionsExport } from './resolve-definitions-export';
import { resolveOwnerConfig } from './resolve-owner-config';
import { resolveSandboxSettings } from './resolve-sandbox-settings';
import { resolveSearchSettings } from './resolve-search-settings';
import { serverPartDeclarations } from './server-part-declarations';
import type { ServerOptions, ServerPartsOptions } from './start-server';

export type ServerInputs = Pick<
  ServerPartsOptions,
  'config' | 'secrets' | 'images' | 'sandbox' | 'definitionsExport' | 'search' | 'log'
> & {
  readonly encoder: ONNXEncoder | null;
};

export async function loadServerInputs(options: ServerOptions): Promise<ServerInputs> {
  const loaded = await loadDeploymentConfig(options.configPath);

  const secrets = await loadSecrets({
    path: loaded.server.secretsFile,
    sopsArgv: options.sopsArgv,
  });

  const config = { ...loaded, owner: resolveOwnerConfig(loaded.owner, secrets.settings) };
  const sandbox = resolveSandboxSettings(loaded, secrets.impdToken);
  const definitionsExport = resolveDefinitionsExport(config, secrets.definitionsExportToken);
  const search = resolveSearchSettings(loaded.search, secrets.connectorCredentials);

  const manifest = await loadSandboxManifest(options.manifestPath);

  const images = pickNeededImages(manifest, listImageNeeds(config, serverPartDeclarations));

  const encoder =
    options.encoderDir === undefined ? null : await startONNXEncoder(options.encoderDir);

  return {
    config,
    secrets,
    images,
    sandbox,
    definitionsExport,
    search,
    log: makeThresholdLogger(options.log, loaded.server.logLevel),
    encoder,
  };
}
