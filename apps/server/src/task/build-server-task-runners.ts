import type { TaskRunnerRegistry } from '@heynixie/tasks';
import { buildTaskRunnerRegistry } from '@heynixie/tasks';
import { defaultTaskRunner, taskRunnerDefinitions } from './task-runner-definitions';

export function buildServerTaskRunners(): TaskRunnerRegistry {
  return buildTaskRunnerRegistry({
    definitions: taskRunnerDefinitions,
    defaultRunner: defaultTaskRunner,
  });
}
