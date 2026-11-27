import type { TaskMessaging, TaskStartBounds } from '@heynixie/tasks';
import { buildRunnerStartTool } from '@heynixie/tasks';
import type { RelatedMemoryLookup, ToolDefinition } from '@heynixie/tools';
import { codingToolNames } from '../connector/coding-tool-names';
import type { CodingAdapter, CodingToolContext } from '../types';

// What the conversation holds that `coding.start` shares with `task.start`.
export interface CodingStartParts {
  readonly messaging: Pick<TaskMessaging, 'hopLimit' | 'ownerName'>;
  readonly bounds: TaskStartBounds;
  readonly relatedMemory?: RelatedMemoryLookup | undefined;
}

// `coding.start`: the tool that starts a coding task on a repository, or joins a running session.
// It starts the coding runner's task through the same path as `task.start`, so the task shows in
// the task list and takes the same controls.
export function buildCodingStartTool(
  context: CodingToolContext,
  adapter: CodingAdapter,
  start: CodingStartParts,
): ToolDefinition {
  return buildRunnerStartTool(context.tasks, start.messaging, start.bounds, {
    name: codingToolNames.start,
    description:
      'Starts a coding task: a coding agent works on a repository in its own session, or you ' +
      'join a session that already runs, which you find with coding.sessions. Give it a short ' +
      'name and a brief. For a new session, the brief is all the coding agent gets, so put ' +
      'everything it needs in it. A joined session gets nothing from the brief. Read the ' +
      'session with coding.read, and steer it with coding.steer.',
    runner: adapter.id,
    relatedMemory: start.relatedMemory,
  });
}
