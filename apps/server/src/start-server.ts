import type { Writer } from '@heynixie/log';
import { startWriter } from '@heynixie/log';
import type { Logger } from '@heynixie/ops';
import { buildCleanup } from './build-cleanup';
import type { DeploymentConfig } from './deployment-config-schema';
import { loadDeploymentConfig } from './load-deployment-config';
import type { SandboxImages } from './load-sandbox-manifest';
import { loadSandboxManifest } from './load-sandbox-manifest';
import type { Secrets } from './load-secrets';
import { loadSecrets } from './load-secrets';
import { resolveOwnerConfig } from './resolve-owner-config';
import { startServerParts } from './start-server-parts';
import type { Cleanup } from './types';

export interface ServerOptions {
  // the deployment configuration, /etc/nixie/config.yaml in a deployment
  readonly configPath: string;

  // the sandbox manifest the release workflow writes into the nixie image
  readonly manifestPath: string;

  // the sops command that decrypts the secrets file
  readonly sopsArgv: readonly string[];
  readonly log: Logger;
}

export interface Server {
  readonly port: number;

  // resolves once runners claim work, and rejects when a stop cuts the start short
  readonly ready: Promise<void>;

  // resolves with the error that ended the runners, such as another process taking the writer
  readonly failed: Promise<unknown>;

  // resolves once a reset finished, after which the server stops and exits 0
  readonly reset: Promise<void>;

  // stops claiming steps, gives steps in flight their grace to commit, then releases every part
  readonly stop: () => Promise<void>;
}

// What the server holds once the writer has started.
export interface ServerPartsOptions extends ServerOptions {
  readonly config: DeploymentConfig;
  readonly secrets: Secrets;
  readonly images: SandboxImages;
  readonly writer: Writer;
  readonly cleanup: Cleanup;
}

// Starts nixie: it refuses an invalid configuration, secrets file or sandbox manifest before it
// opens anything, then takes the writer lock and a new writer epoch, and copies and migrates the
// database, before the health endpoint listens.
export async function startServer(options: ServerOptions): Promise<Server> {
  const loaded = await loadDeploymentConfig(options.configPath);
  const secrets = await loadSecrets({
    path: loaded.server.secretsFile,
    sopsArgv: options.sopsArgv,
  });
  const config = { ...loaded, owner: resolveOwnerConfig(loaded.owner, secrets.settings) };
  const images = await loadSandboxManifest(options.manifestPath);
  const cleanup = buildCleanup();
  const writer = await startLoggedWriter(config.server.dataDir, options.log, cleanup);

  try {
    return await startServerParts({ ...options, config, secrets, images, writer, cleanup });
  } catch (error) {
    await cleanup.stop();
    throw error;
  }
}

async function startLoggedWriter(dataDir: string, log: Logger, cleanup: Cleanup): Promise<Writer> {
  const writer = await startWriter({ dataDir });

  await cleanup.defer(() => writer.stop());
  log('writer.started', {
    epoch: writer.epoch,
    schemaFrom: writer.migration.from,
    schemaTo: writer.migration.to,
    isCopied: writer.migration.copyPath !== null,
  });
  return writer;
}
