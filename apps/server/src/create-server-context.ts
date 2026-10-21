import type { APIContext, CleanupRecordSessions } from '@heynixie/api';
import { defaultAPISettings } from '@heynixie/api';
import { readDefinitionsInForce } from '@heynixie/definitions';
import type { Writer } from '@heynixie/log';
import { buildServerLog } from './build-server-log';
import type { InForce } from './types';

export interface ServerContext {
  readonly apiContext: APIContext;
  readonly inForce: InForce;
}

export async function createServerContext(
  writer: Writer,
  deploymentKey: CryptoKey,
  readSessionCleanup: () => CleanupRecordSessions | null,
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
      settings: defaultAPISettings,
      readSessionCleanup,
    },
  };
}
