import type { ONNXEncoder } from '@heynixie/encoder-onnx';
import { startONNXEncoder } from '@heynixie/encoder-onnx';
import { makeThresholdLogger } from '@heynixie/logger';
import { resolveOwnerConfig } from '../config/resolve-owner-config';
import { resolveDefinitionsExport } from '../definition/resolve-definitions-export';
import { readDeploymentConfig } from '../deployment/read-deployment-config';
import { listImageNeeds } from '../part/list-image-needs';
import { serverPartDeclarations } from '../part/server-part-declarations';
import { loadSandboxManifest } from '../sandbox/load-sandbox-manifest';
import { pickNeededImages } from '../sandbox/pick-needed-images';
import { resolveSandboxSettings } from '../sandbox/resolve-sandbox-settings';
import { createSpendInputs } from '../spend/create-spend-inputs';
import { loadSecrets } from './load-secrets';
import { resolveImageSettings } from './resolve-image-settings';
import { resolveSearchSettings } from './resolve-search-settings';
import type { ServerOptions, ServerPartsOptions } from './start-server';

export type ServerInputs = Pick<
  ServerPartsOptions,
  | 'config'
  | 'secrets'
  | 'images'
  | 'sandbox'
  | 'definitionsExport'
  | 'search'
  | 'imageSettings'
  | 'spend'
  | 'log'
> & {
  readonly encoder: ONNXEncoder | null;
};

export async function loadServerInputs(options: ServerOptions): Promise<ServerInputs> {
  const read = await readDeploymentConfig(options.configPath);

  const loaded = read.config;
  const log = makeThresholdLogger(options.log, loaded.server.logLevel);

  for (const key of read.unknownKeys) {
    log('config.unknown_key', { key }, 'warn');
  }

  const secrets = await loadSecrets({
    path: loaded.server.secretsFile,
    sopsArgv: options.sopsArgv,
  });

  const config = { ...loaded, owner: resolveOwnerConfig(loaded.owner, secrets.settings) };
  const sandbox = resolveSandboxSettings(loaded, secrets.impdToken);

  const definitionsExport = resolveDefinitionsExport(config, {
    token: secrets.definitionsExportToken,
    appKey: secrets.definitionsExportAppKey,
  });

  const search = resolveSearchSettings(loaded.search, secrets.connectorCredentials);
  const imageSettings = resolveImageSettings(loaded.images, secrets.connectorCredentials);
  const spend = createSpendInputs(loaded.spendStop, secrets.settings);

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
    imageSettings,
    spend,
    log,
    encoder,
  };
}
