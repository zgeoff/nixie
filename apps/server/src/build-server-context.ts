import type { APIContext, CleanupRecordSessions } from '@heynixie/api';
import { defaultAPISettings } from '@heynixie/api';
import { findDefinitionsInForce } from '@heynixie/definitions';
import type { Writer } from '@heynixie/log';
import { systemClock } from '@heynixie/tasks';
import { buildServerLog } from './build-server-log';
import type { InForce, SessionCleanupSlot } from './types';

export interface ServerContext {
  readonly apiContext: APIContext;
  readonly inForce: InForce;
  readonly sessionCleanup: SessionCleanupSlot;
}

// The context every module writes through: the server's log, the system clock, and the snapshot
// hash of the definitions in force, which the API's context extends with its settings and the
// conversation's session cleanup, empty until the conversation starts.
export async function buildServerContext(
  writer: Writer,
  deploymentKey: CryptoKey,
): Promise<ServerContext> {
  const current = { inForce: await findDefinitionsInForce(writer.db) };

  const inForce: InForce = {
    read: () => current.inForce,
    set: (next) => {
      current.inForce = next;
    },
  };

  const sessions: { cleanup: CleanupRecordSessions | null } = { cleanup: null };

  return {
    inForce,
    sessionCleanup: {
      set: (cleanup) => {
        sessions.cleanup = cleanup;
      },
    },
    apiContext: {
      log: buildServerLog(writer, deploymentKey),
      clock: systemClock,

      // an empty hash before the first seed, which the log refuses, so nothing writes until a seed
      definitions: () => ({ snapshotHash: inForce.read()?.snapshotHash ?? '' }),
      settings: defaultAPISettings,
      readSessionCleanup: () => sessions.cleanup,
    },
  };
}
