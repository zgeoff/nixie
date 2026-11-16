import type { TaskRunnerDefinition } from '@heynixie/tasks';
import { conversationRunner, sandboxRunner } from '@heynixie/tasks';
import { queueCheckRunner } from '../queue/queue-check-runner';

// The one list of runner definitions. A task runs on the runner whose definition lists it, or
// whose key its record names.
export const taskRunnerDefinitions: readonly TaskRunnerDefinition[] = [
  conversationRunner,
  sandboxRunner,
  queueCheckRunner,
];

// runs a started task whose record names no runner
export const defaultTaskRunner: TaskRunnerDefinition = sandboxRunner;
