import { buildTaskRunnerRegistry } from '../runner/build-task-runner-registry';
import { conversationRunner } from '../runner/conversation-runner';
import { sandboxRunner } from '../runner/sandbox-runner';
import type { TaskRunnerRegistry } from '../runner/types';

export function buildTestTaskRunners(): TaskRunnerRegistry {
  return buildTaskRunnerRegistry({
    definitions: [conversationRunner, sandboxRunner],
    defaultRunner: sandboxRunner,
  });
}
