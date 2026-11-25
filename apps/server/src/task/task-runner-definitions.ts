import type { TaskRunnerDefinition } from '@heynixie/tasks';
import { callRunner, conversationRunner, sandboxRunner } from '@heynixie/tasks';
import { queueCheckRunner } from '../queue/queue-check-runner';

// The one list of runner definitions. A task runs on the runner whose definition lists it, or
// whose key its record names.
export const taskRunnerDefinitions: readonly TaskRunnerDefinition[] = [
  conversationRunner,
  sandboxRunner,
  callRunner,
  queueCheckRunner,
];

// runs a started task whose record names no runner
export const defaultTaskRunner: TaskRunnerDefinition = sandboxRunner;
