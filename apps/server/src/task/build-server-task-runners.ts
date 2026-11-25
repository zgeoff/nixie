import type { TaskRunnerDefinition, TaskRunnerRegistry } from '@heynixie/tasks';
import { buildTaskRunnerRegistry } from '@heynixie/tasks';
import { defaultTaskRunner, taskRunnerDefinitions } from './task-runner-definitions';

interface ServerTaskRunnersOptions {
  // the coding runner, when the deployment sets one
  readonly coding: TaskRunnerDefinition | null;
}

// The registry of the server's runners.
export function buildServerTaskRunners(options: ServerTaskRunnersOptions): TaskRunnerRegistry {
  const coding = options.coding;

  return buildTaskRunnerRegistry({
    definitions: coding === null ? taskRunnerDefinitions : [...taskRunnerDefinitions, coding],
    defaultRunner: defaultTaskRunner,
  });
}
