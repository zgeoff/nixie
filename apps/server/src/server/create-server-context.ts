import type { APIContext, APISettings, CleanupRecordSessions } from '@heynixie/api';
import { createPasskeyState, defaultAPISettings } from '@heynixie/api';
import {
  makeReadDefinitionRunPolicy,
  readDefinitionVersion,
  readDefinitionsInForce,
} from '@heynixie/definitions';
import type { Writer } from '@heynixie/log';
import type { RunSettings, TaskLimits, TaskRunnerRegistry } from '@heynixie/tasks';
import { readDefinitionNextFire } from '@heynixie/triggers';
import type { InForce } from '../types';
import { buildServerLog } from './build-server-log';
import { makeReadZone } from './make-read-zone';

export interface ServerContext {
  readonly apiContext: APIContext;
  readonly inForce: InForce;
}

export interface ServerContextOptions {
  readonly runSettings: RunSettings;
  readonly runners: TaskRunnerRegistry;

  // the limits that a definition's task run takes for each one its file leaves out
  readonly taskRunLimits: TaskLimits;

  // the zone that 'owner' resolves to until the owner has sent a message that carries one
  readonly defaultZone: string;
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
      runners: options.runners,
      readDefinitionVersion,
      readDefinitionRunPolicy: makeReadDefinitionRunPolicy(options.taskRunLimits),
      readDefinitionNextFire: (db, definitionID) =>
        readDefinitionNextFire(db, makeReadZone(writer, db, options.defaultZone), definitionID),
      settings: options.settings ?? defaultAPISettings,
      passkeys: createPasskeyState(),
      readZone: makeReadZone(writer, writer.db, options.defaultZone),
      readSessionCleanup,
    },
  };
}
