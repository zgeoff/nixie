import type { Clock } from '@heynixie/clock';
import type { Definitions, Log } from '@heynixie/log';
import type { Logger } from '@heynixie/logger';
import type { ResolvedProfile } from '@heynixie/models';
import { bindHarness, grantModelSecret, resolveModelCredentials } from '@heynixie/models';
import { sandboxSizes } from '@heynixie/sandbox';
import type { SpendContext } from '@heynixie/spend';
import type { TaskStartBounds, WorkerRunsConfig } from '@heynixie/tasks';
import type { ToolDefinition, ToolEndpoint } from '@heynixie/tools';
import invariant from 'tiny-invariant';
import { buildGuestCommand } from '../task/build-guest-command';
import { getHarnessImage } from '../task/get-harness-image';
import type { SystemTaskOptions } from '../task/make-system-task-runner';
import { makeSystemTaskRunner } from '../task/make-system-task-runner';
import { buildWorkerRunTool } from './build-worker-run-tool';
import { makeWorkerSlots } from './make-worker-slots';
import type { WorkerDeps, WorkerTarget } from './types';

export interface WorkerToolOptions extends SystemTaskOptions {
  readonly log: Log;
  readonly definitions: () => Definitions;
  readonly clock: Clock;
  readonly logger: Logger;

  // the endpoint that serves the worker's tools, which starts after this tool is built
  readonly readTools: () => Pick<ToolEndpoint, 'startRun'> | null;

  // the cap on workers at once; absent means no cap
  readonly workerRuns?: WorkerRunsConfig;

  // set with the spending stop, which refuses a worker while it stands
  readonly spend?: SpendContext;
}

export interface WorkerTool {
  // the tool needs the bounds of a started task, which the endpoint builds after this part starts
  readonly buildTool: (
    bounds: Pick<TaskStartBounds, 'memoryTools' | 'conversationTools' | 'models'>,
  ) => ToolDefinition;
}

// The model's secret goes in at start, so a deployment that lacks it fails here and not at the first
// worker. A stop refuses every later call and waits for the destroys in flight.
export const startWorkerTool = makeSystemTaskRunner<WorkerToolOptions, WorkerTool>({
  role: 'worker',
  entry: 'turn',
  start: async (options, session) => {
    const credentials = resolveModelCredentials(
      options.models,
      options.credentials.resolveCredential,
    );

    const targets = new Map<string, WorkerTarget>();

    // One target and one secret for each distinct profile, so a missing credential fails the start.
    const createTarget = async (profile: ResolvedProfile): Promise<WorkerTarget> => {
      const known = targets.get(profile.profile.id);

      if (known !== undefined) {
        return known;
      }

      const harness = bindHarness(profile.profile);

      const secret = await grantModelSecret(profile, harness, {
        store: options.credentials.store,
        sandboxes: options.sandboxes,
      });

      const target: WorkerTarget = {
        profile,
        harness,
        image: getHarnessImage(options.images, harness.imageKey),
        size: sandboxSizes[harness.sizeRows.systemTask],
        modelGrant: harness.buildGrant(secret),
        command: buildGuestCommand(options.sandboxes, harness.guest, 'turn'),
      };

      targets.set(profile.profile.id, target);

      return target;
    };

    const role = await createTarget(session.profile);

    const byModel = new Map<string, WorkerTarget>();

    // An entry that asks is no choice, as for a task.
    for (const entry of options.models.selectable.filter((choice) => !choice.isAsked)) {
      const resolved = credentials[entry.profile];

      invariant(resolved, `the selectable model ${entry.name} was never resolved`);

      const target = await createTarget(resolved);

      byModel.set(entry.name, target);
    }

    const state = { isRunning: true };

    const deps: WorkerDeps = {
      log: options.log,
      definitions: options.definitions,
      clock: options.clock,
      logger: options.logger,
      sandboxes: options.sandboxes,
      readTools: options.readTools,
      targets: { role, byModel },
      slots: makeWorkerSlots(options.workerRuns),
      failedDestroys: [],
      cleanups: new Set(),
      ...(options.gateway === undefined ? {} : { gateway: options.gateway }),
      ...(options.spend === undefined ? {} : { spend: options.spend }),
    };

    session.defer(async () => {
      state.isRunning = false;

      await Promise.allSettled(deps.cleanups);
    });

    return {
      buildTool: (bounds) =>
        buildWorkerRunTool({
          deps,
          bounds,
          limits: options.models.limits.workerRun,
          isRunning: () => state.isRunning,
        }),
    };
  },
});
