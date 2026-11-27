import { makeQueueRunnerActions } from '@heynixie/actions';
import type { APIContext, APISettings, CleanupRecordSessions } from '@heynixie/api';
import { createClientRegistry, createPasskeyState, defaultAPISettings } from '@heynixie/api';
import { buildBuiltInBudgets } from '@heynixie/budgets';
import { callBudgetName } from '@heynixie/calls';
import type { FeatureID } from '@heynixie/contract';
import {
  makeReadDefinitionRunPolicy,
  readDefinitionNotices,
  readDefinitionVersion,
  readDefinitionsInForce,
} from '@heynixie/definitions';
import type { Writer } from '@heynixie/log';
import type {
  DisplayRates,
  PlanLoginsHolder,
  SpendGateway,
  SpendTurnLimits,
} from '@heynixie/spend';
import type { RunSettings, TaskLimits, TaskRunnerRegistry } from '@heynixie/tasks';
import { readDefinitionNextFire } from '@heynixie/triggers';
import { paidToolLimits, paidToolNames } from '../budget/paid-tool-names';
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

  // the features that are on, which nixie.read reports
  readonly features: readonly FeatureID[];

  // the gateway and the turn limits of the spending stop, or absent without spendStop
  readonly spend?: {
    readonly gateway: SpendGateway;
    readonly limits: SpendTurnLimits;
    readonly planLogins: PlanLoginsHolder;
    readonly display: DisplayRates | null;
  };
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

  const log = buildServerLog(writer, deploymentKey);
  const definitions = () => ({ snapshotHash: inForce.read()?.snapshotHash ?? '' });

  const budgets = {
    log,
    clock: writer.clock,
    zone: options.defaultZone,
    definitions,
    builtIn: () =>
      buildBuiltInBudgets(
        [...paidToolNames, ...(options.features.includes('voice') ? [callBudgetName] : [])],
        paidToolLimits,
      ),
  };

  return {
    inForce,
    apiContext: {
      log,
      clock: writer.clock,
      definitions,
      budgets,
      ...(options.spend === undefined
        ? {}
        : {
            spend: {
              gateway: options.spend.gateway,
              log,
              clock: writer.clock,
              zone: options.defaultZone,
              limits: options.spend.limits,
              definitions,
              planLogins: options.spend.planLogins,
              ...(options.spend.display === null ? {} : { display: options.spend.display }),
            },
          }),
      runSettings: options.runSettings,
      runners: options.runners,
      queueRunnerActions: makeQueueRunnerActions({ log, clock: writer.clock, definitions }),
      readDefinitionVersion,
      readDefinitionRunPolicy: makeReadDefinitionRunPolicy(options.taskRunLimits),
      readDefinitionNextFire: (db, definitionID) =>
        readDefinitionNextFire(db, makeReadZone(writer, db, options.defaultZone), definitionID),
      readDefinitionNotices: (db, changeIDs) =>
        readDefinitionNotices(db, changeIDs, {
          now: writer.clock.now(),
          readZone: makeReadZone(writer, db, options.defaultZone),
        }),
      settings: options.settings ?? defaultAPISettings,
      features: options.features,
      passkeys: createPasskeyState(),
      clients: createClientRegistry({ clock: writer.clock }),
      readZone: makeReadZone(writer, writer.db, options.defaultZone),
      readSessionCleanup,
    },
  };
}
