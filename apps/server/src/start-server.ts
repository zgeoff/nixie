import type { Clock } from '@heynixie/clock';
import type { Writer } from '@heynixie/log';
import { startWriter } from '@heynixie/log';
import type { Logger } from '@heynixie/logger';
import type { SandboxAdapter } from '@heynixie/sandbox';
import { buildCleanup } from './build-cleanup';
import type { SandboxAdapterOptions } from './create-sandbox-adapter';
import type { DeploymentConfig } from './deployment-config-schema';
import type { CrashHarness } from './join-crash-harness';
import type { SandboxImages } from './load-sandbox-manifest';
import type { Secrets } from './load-secrets';
import { loadServerInputs } from './load-server-inputs';
import type { DefinitionsExportSettings } from './resolve-definitions-export';
import type { SandboxSettings } from './resolve-sandbox-settings';
import { startServerWork } from './start-server-work';
import type { Cleanup, ServerParts } from './types';

export interface ServerOptions {
  readonly configPath: string;

  readonly manifestPath: string;

  readonly sopsArgv: readonly string[];

  readonly encoderDir?: string;
  readonly log: Logger;

  readonly createSandboxAdapter?: (options: SandboxAdapterOptions) => SandboxAdapter;

  readonly harness?: CrashHarness;
}

export interface Server {
  readonly port: number;

  readonly ready: Promise<void>;

  readonly failed: Promise<unknown>;

  readonly reset: Promise<void>;

  readonly log: Logger;

  readonly stop: () => Promise<void>;
}

export interface ServerPartsOptions extends ServerOptions {
  readonly config: DeploymentConfig;
  readonly secrets: Secrets;
  readonly images: SandboxImages;

  readonly sandbox: SandboxSettings;

  readonly definitionsExport: DefinitionsExportSettings | null;
  readonly writer: Writer;
  readonly cleanup: Cleanup;

  readonly encoder: ServerParts['encoder'];
}

export async function startServer(options: ServerOptions): Promise<Server> {
  const inputs = await loadServerInputs(options);

  const cleanup = buildCleanup();
  const encoder = inputs.encoder;

  if (encoder !== null) {
    await cleanup.defer(() => encoder.stop());
  }

  try {
    const writer = await startLoggedWriter(inputs.config.server.dataDir, {
      log: inputs.log,
      cleanup,
      ...(options.harness === undefined ? {} : { clock: options.harness.link.clock }),
    });

    return await startServerWork({ ...options, ...inputs, writer, cleanup });
  } catch (error) {
    await cleanup.stop();

    throw error;
  }
}

interface LoggedWriterOptions {
  readonly log: Logger;
  readonly cleanup: Cleanup;

  readonly clock?: Clock;
}

async function startLoggedWriter(dataDir: string, options: LoggedWriterOptions): Promise<Writer> {
  const writer = await startWriter({
    dataDir,
    ...(options.clock === undefined ? {} : { clock: options.clock }),
  });

  await options.cleanup.defer(() => writer.stop());

  options.log('writer.started', {
    epoch: writer.epoch,
    schemaFrom: writer.migration.from,
    schemaTo: writer.migration.to,
    isCopied: writer.migration.copyPath !== null,
  });

  return writer;
}
