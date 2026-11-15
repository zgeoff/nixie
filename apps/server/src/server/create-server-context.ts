import type { APIContext, APISettings, CleanupRecordSessions } from '@heynixie/api';
import { createPasskeyState, defaultAPISettings } from '@heynixie/api';
import { readDefinitionsInForce } from '@heynixie/definitions';
import type { Writer } from '@heynixie/log';
import type { RunSettings } from '@heynixie/tasks';
import type { InForce } from '../types';
import { buildServerLog } from './build-server-log';

export interface ServerContext {
  readonly apiContext: APIContext;
  readonly inForce: InForce;
}

export interface ServerContextOptions {
  readonly runSettings: RunSettings;
  readonly settings?: APISettings;
}

export async function createServerContext(
  writer: Writer,
  deploymentKey: CryptoKey,
  readSessionCleanup: () => CleanupRecordSessions | null,
  options: ServerContextOptions,
): Promise<ServerContext> {
  const current = { inForce: await readDefinitionsInForce(writer.db) };

  const inForce: InForce = {
    read: () => current.inForce,
    set: (next) => {
      current.inForce = next;
    },
  };

  return {
    inForce,
    apiContext: {
      log: buildServerLog(writer, deploymentKey),
      clock: writer.clock,

      definitions: () => ({ snapshotHash: inForce.read()?.snapshotHash ?? '' }),
      runSettings: options.runSettings,
      settings: options.settings ?? defaultAPISettings,
      passkeys: createPasskeyState(),
      readSessionCleanup,
    },
  };
}
