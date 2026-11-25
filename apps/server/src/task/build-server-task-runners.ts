import type { TaskRunnerDefinition, TaskRunnerRegistry } from '@heynixie/tasks';
import { buildTaskRunnerRegistry } from '@heynixie/tasks';
import { defaultTaskRunner, taskRunnerDefinitions } from './task-runner-definitions';

interface ServerTaskRunnersOptions {
  // the coding runner, when the deployment sets one
  readonly coding: TaskRunnerDefinition | null;

  // a test build makes the coding runner the default, so a start tool that advertises only the
  // default start offers the coding start
  readonly isCodingDefault: boolean;
}

// The registry of the server's runners.
export function buildServerTaskRunners(options: ServerTaskRunnersOptions): TaskRunnerRegistry {
  const coding = options.coding;

  return buildTaskRunnerRegistry({
    definitions: coding === null ? taskRunnerDefinitions : [...taskRunnerDefinitions, coding],
    defaultRunner: coding !== null && options.isCodingDefault ? coding : defaultTaskRunner,
  });
}
