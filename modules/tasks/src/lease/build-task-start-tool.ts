import type { RelatedMemoryLookup, ToolDefinition } from '@heynixie/tools';
import type { TaskStartBounds } from '../types';
import { buildRunnerStartTool } from './build-runner-start-tool';
import type { StartMessaging, StartToolContext } from './types';

// `task.start`, which starts the default runner's task. Every other runner that a model can start
// has a tool of its own, from `buildRunnerStartTool`.
export function buildTaskStartTool(
  context: StartToolContext,
  messaging: StartMessaging,
  bounds: TaskStartBounds,

  // what task.start looks up in memory after it applies, for a starter that reads memory; without
  // it, the result carries no `related`
  relatedMemory?: RelatedMemoryLookup,
): ToolDefinition {
  const owner = messaging.ownerName ?? 'the owner';
  const runner = context.runners.defaultRunner.key;

  const tool = buildRunnerStartTool(context, messaging, bounds, {
    name: 'task.start',
    description:
      'Starts a new task for work that needs its own context, can wait, or lasts beyond this ' +
      `turn, whether ${owner} asked for it or you saw it needed doing. ` +
      'Give it a short name, such as "Garden plan", and a brief ' +
      'that holds everything the task needs to do the work, because the task sees only its ' +
      'brief and the messages it receives. When a task may already cover the work, check ' +
      'tasks.list, and pass the work to that task with task.message instead. The task speaks as you ' +
      'unless you set persona to none, and reads your memory only when you set memory to read. ' +
      'It always holds tasks.list and task.message, and time.now unless you list its tools, ' +
      'which must be tools you hold yourself. A memory read tool also needs memory set to read. ' +
      "Set log to conversation to let the task read the conversation's log.",
    runner,
    relatedMemory,
  });

  // a rule matches the default runner's start as `task.start/<runner>`
  return {
    ...tool,
    variants: {
      pick: () => runner,
      declarations: { [runner]: tool.declaration },
    },
  };
}
