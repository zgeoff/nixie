import type { Clock } from '@heynixie/clock';
import type { Definitions, Log } from '@heynixie/log';
import type { Logger } from '@heynixie/logger';
import { bindHarness, deriveModelSecret } from '@heynixie/models';
import type { TaskStartBounds, WorkerRunsConfig } from '@heynixie/tasks';
import type { ToolDefinition, ToolEndpoint } from '@heynixie/tools';
import type { SystemTaskOptions } from '../task/make-system-task-runner';
import { makeSystemTaskRunner } from '../task/make-system-task-runner';
import { buildWorkerRunTool } from './build-worker-run-tool';
import { makeWorkerSlots } from './make-worker-slots';
import type { WorkerDeps } from './types';

export interface WorkerToolOptions extends SystemTaskOptions {
  readonly log: Log;
  readonly definitions: () => Definitions;
  readonly clock: Clock;
  readonly logger: Logger;

  // the endpoint that serves the worker's tools, which starts after this tool is built
  readonly readTools: () => Pick<ToolEndpoint, 'startRun'> | null;

  // the cap on workers at once; absent means no cap
  readonly workerRuns?: WorkerRunsConfig;
}

export interface WorkerTool {
  // the tool needs the bounds of a started task, which the endpoint builds after this part starts
  readonly buildTool: (
    bounds: Pick<TaskStartBounds, 'memoryTools' | 'conversationTools'>,
  ) => ToolDefinition;
}

// The model's secret goes in at start, so a deployment that lacks it fails here and not at the first
// worker. A stop refuses every later call and waits for the destroys in flight.
export const startWorkerTool = makeSystemTaskRunner<WorkerToolOptions, WorkerTool>({
  role: 'worker',
  entry: 'turn',
  start: async (options, session) => {
    const harness = bindHarness(session.profile.profile);
    const secret = deriveModelSecret(session.profile, harness);

    await options.sandboxes.addSecret(secret);

    const state = { isRunning: true };

    const deps: WorkerDeps = {
      log: options.log,
      definitions: options.definitions,
      clock: options.clock,
      logger: options.logger,
      sandboxes: options.sandboxes,
      readTools: options.readTools,
      profile: session.profile,
      harness,
      image: session.image,
      size: session.limits,
      modelGrant: harness.buildGrant(secret),
      command: session.command,
      slots: makeWorkerSlots(options.workerRuns),
      failedDestroys: [],
      cleanups: new Set(),
      ...(options.gateway === undefined ? {} : { gateway: options.gateway }),
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
