import type { Writer } from '@heynixie/log';
import { startWriter } from '@heynixie/log';
import type { Logger } from '@heynixie/ops';
import { buildCleanup } from './build-cleanup';
import type { DeploymentConfig } from './deployment-config-schema';
import type { SandboxImages } from './load-sandbox-manifest';
import type { Secrets } from './load-secrets';
import { loadServerInputs } from './load-server-inputs';
import type { SandboxSettings } from './resolve-sandbox-settings';
import { startServerParts } from './start-server-parts';
import type { Cleanup, ServerParts } from './types';

export interface ServerOptions {
  // the deployment configuration, /etc/nixie/config.yaml in a deployment
  readonly configPath: string;

  // the sandbox manifest the release workflow writes into the nixie image
  readonly manifestPath: string;

  // the sops command that decrypts the secrets file
  readonly sopsArgv: readonly string[];

  // the folder of the encoder's pinned model files, /app/encoder in the nixie image; with none,
  // memory search reads keywords only
  readonly encoderDir?: string;
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

  // the logger that writes only the events at the configured level or above it
  readonly log: Logger;

  // stops claiming steps, gives steps in flight their grace to commit, then releases every part
  readonly stop: () => Promise<void>;
}

// What the server holds once the writer has started.
export interface ServerPartsOptions extends ServerOptions {
  readonly config: DeploymentConfig;
  readonly secrets: Secrets;
  readonly images: SandboxImages;

  // the sandbox adapter the configuration selects, with impd's section and token for imp
  readonly sandbox: SandboxSettings;
  readonly writer: Writer;
  readonly cleanup: Cleanup;

  // the encoder the memory store's vector index runs, or null for keyword search alone
  readonly encoder: ServerParts['encoder'];
}

// Starts nixie: it refuses an invalid configuration, secrets file or sandbox manifest, and loads
// the encoder's model, before it opens anything, then takes the writer lock and a new writer epoch,
// and copies and migrates the database, before the health endpoint listens.
export async function startServer(options: ServerOptions): Promise<Server> {
  const inputs = await loadServerInputs(options);

  const cleanup = buildCleanup();
  const encoder = inputs.encoder;

  if (encoder !== null) {
    await cleanup.defer(() => encoder.stop());
  }

  try {
    // the writer starts under the cleanup too, so a writer lock held elsewhere releases the encoder
    const writer = await startLoggedWriter(inputs.config.server.dataDir, inputs.log, cleanup);

    return await startServerParts({ ...options, ...inputs, writer, cleanup });
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
