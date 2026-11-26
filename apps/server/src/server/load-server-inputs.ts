import { createCredentialStore, loadSecrets } from '@heynixie/credentials';
import { resolveHostAddresses } from '@heynixie/egress';
import type { ONNXEncoder } from '@heynixie/encoder-onnx';
import { startONNXEncoder } from '@heynixie/encoder-onnx';
import { makeThresholdLogger } from '@heynixie/logger';
import type { ModelCredentials } from '@heynixie/models';
import { readOwnerConfig } from '../config/read-owner-config';
import { createHeldSlot } from '../credential/create-held-slot';
import { resolveDefinitionsExport } from '../definition/resolve-definitions-export';
import { readDeploymentConfig } from '../deployment/read-deployment-config';
import { listImageNeeds } from '../part/list-image-needs';
import { serverPartDeclarations } from '../part/server-part-declarations';
import { loadSandboxManifest } from '../sandbox/load-sandbox-manifest';
import { pickNeededImages } from '../sandbox/pick-needed-images';
import { resolveSandboxSettings } from '../sandbox/resolve-sandbox-settings';
import { createSpendInputs } from '../spend/create-spend-inputs';
import { buildTestCredentialChecks } from './build-test-credential-checks';
import { createImageSettings } from './create-image-settings';
import { createSearchSettings } from './create-search-settings';
import type { ServerOptions, ServerPartsOptions } from './start-server';

export type ServerInputs = Pick<
  ServerPartsOptions,
  | 'config'
  | 'secrets'
  | 'credentials'
  | 'heldSlot'
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

  const config = { ...loaded, owner: readOwnerConfig(loaded.owner, secrets.readSetting) };
  const sandbox = resolveSandboxSettings(loaded, secrets.impdToken);
  const publicEgress = sandbox.adapter === 'imp' ? sandbox.imp.publicEgress : null;
  const heldSlot = createHeldSlot();

  const store = createCredentialStore({
    secrets,
    held: heldSlot.read,
    denied: [...(publicEgress?.hostAddresses ?? []), ...(publicEgress?.egressDeny ?? [])],
    ...(NIXIE_TEST_BUILD
      ? buildTestCredentialChecks(
          options.credentialSite ?? null,
          options.harness?.googleURL ?? null,
        )
      : { resolveHost: resolveHostAddresses }),
  });

  const credentials: ModelCredentials = { resolveCredential: secrets.resolveCredential, store };

  const definitionsExport = resolveDefinitionsExport(config, {
    token: secrets.definitionsExportToken,
    appKey: secrets.definitionsExportAppKey,
  });

  const search = createSearchSettings(loaded.search, credentials);
  const imageSettings = createImageSettings(loaded.images, credentials);

  const spend = createSpendInputs(loaded.spendStop, credentials, {
    config: loaded.display,
    log,
  });

  const manifest = await loadSandboxManifest(options.manifestPath);

  const images = pickNeededImages(manifest, listImageNeeds(config, serverPartDeclarations));

  const encoder =
    options.encoderDir === undefined ? null : await startONNXEncoder(options.encoderDir);

  return {
    config,
    secrets,
    credentials,
    heldSlot,
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
