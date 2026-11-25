import type { SpeechLayer } from '@heynixie/calls';
import type { Clock } from '@heynixie/clock';
import type { Secrets } from '@heynixie/credentials';
import type { Writer } from '@heynixie/log';
import { startWriter } from '@heynixie/log';
import type { Logger } from '@heynixie/logger';
import type { ModelCredentials } from '@heynixie/models';
import type { SandboxAdapter } from '@heynixie/sandbox';
import { writeMissedTurns } from '@heynixie/spend';
import type { HeldSlot } from '../credential/create-held-slot';
import type { DefinitionsExportSettings } from '../definition/resolve-definitions-export';
import type { DeploymentConfig } from '../deployment/deployment-config-schema';
import { registerServerRecordTopics } from '../part/register-server-record-topics';
import type { SandboxAdapterOptions } from '../sandbox/create-sandbox-adapter';
import type { SandboxImages } from '../sandbox/load-sandbox-manifest';
import type { SandboxSettings } from '../sandbox/resolve-sandbox-settings';
import type { SpendInputs } from '../spend/create-spend-inputs';
import { startSpendChecks } from '../spend/start-spend-checks';
import type { Cleanup, ServerParts } from '../types';
import { buildCleanup } from './build-cleanup';
import type { TestCredentialSite } from './build-test-credential-checks';
import type { ImageSettings } from './create-image-settings';
import type { SearchSettings } from './create-search-settings';
import type { CrashHarness } from './join-crash-harness';
import { loadServerInputs } from './load-server-inputs';
import { startServerWork } from './start-server-work';

export interface ServerOptions {
  readonly configPath: string;

  readonly manifestPath: string;

  readonly sopsArgv: readonly string[];

  readonly encoderDir?: string;
  readonly log: Logger;

  readonly createSandboxAdapter?: (options: SandboxAdapterOptions) => SandboxAdapter;

  readonly harness?: CrashHarness;

  // a test build's loopback site, which every credential request goes to
  readonly credentialSite?: TestCredentialSite;

  // a speech layer that takes the place of the provider's, which a test build passes
  readonly speech?: SpeechLayer;
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
  readonly credentials: ModelCredentials;
  readonly heldSlot: HeldSlot;
  readonly images: SandboxImages;

  readonly sandbox: SandboxSettings;

  readonly definitionsExport: DefinitionsExportSettings | null;
  readonly search: SearchSettings | null;
  readonly imageSettings: ImageSettings | null;

  // the gateway that counts every model request, or null when the config sets no spendStop
  readonly spend: SpendInputs | null;

  // whether the start checks left the gateway without its limits, because it gave no answer
  readonly isSpendUnsent: boolean;
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

    // the release before writes turn records with no fold, so each start counts the ones it left
    await writeMissedTurns(writer);

    const spendStart = await startSpendChecks(inputs);

    return await startServerWork({
      ...options,
      ...inputs,
      isSpendUnsent: spendStart === 'unsent',
      writer,
      cleanup,
    });
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
    installsRestorePause: true,
    ...(options.clock === undefined ? {} : { clock: options.clock }),
  });

  registerServerRecordTopics(writer);

  await options.cleanup.defer(() => writer.stop());

  options.log('writer.started', {
    epoch: writer.epoch,
    schemaFrom: writer.migration.from,
    schemaTo: writer.migration.to,
    isCopied: writer.migration.copyPath !== null,
  });

  return writer;
}
