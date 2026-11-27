import type { TaskRunnerDefinition, TaskRunnerRegistry } from '@heynixie/tasks';
import { buildTaskRunnerRegistry, callRunner } from '@heynixie/tasks';
import { defaultTaskRunner, taskRunnerDefinitions } from './task-runner-definitions';

interface ServerTaskRunnersOptions {
  // the coding runner, when the deployment sets one
  readonly coding: TaskRunnerDefinition | null;

  // whether the deployment has calls, whose tasks run on the call runner
  readonly isCallsOn: boolean;
}

// The registry of the server's runners.
export function buildServerTaskRunners(options: ServerTaskRunnersOptions): TaskRunnerRegistry {
  return buildTaskRunnerRegistry({
    definitions: [
      ...taskRunnerDefinitions,
      ...(options.isCallsOn ? [callRunner] : []),
      ...(options.coding === null ? [] : [options.coding]),
    ],
    defaultRunner: defaultTaskRunner,
  });
}
