import { makeDecisionPoint } from '@heynixie/policy';
import type { RunStep, TasksContext } from '@heynixie/tasks';
import { buildStepRunID } from '@heynixie/tasks';
import type { ActionQueue, ToolDefinition } from '@heynixie/tools';
import { buildToolRegistry, runToolCall } from '@heynixie/tools';

export interface QueueCheckStepOptions {
  readonly context: TasksContext;
  readonly queue: ActionQueue;

  // the log-only connector's tool, the one tool on the check's list
  readonly tool: ToolDefinition;
}

// The queue check runs no model, so its calls' records name none.
const noModel = { model: 'none', profile: 'none' };

// Makes the queue check's step. A wake in the inbox, which each start writes, calls the log-only
// connector's tool through the decision point and the action queue, as a model's call would go,
// and leaves its outcome to reach the inbox. A step that holds only that outcome reads it and waits.
export function makeQueueCheckStep(options: QueueCheckStepOptions): RunStep {
  const registry = buildToolRegistry([options.tool]);

  const decide = makeDecisionPoint({
    findDeclaration: (name) => registry.findTool(name)?.definition.declaration ?? null,
  });

  return async (input) => {
    if (input.inbox.some((record) => record.kind === 'task.wake')) {
      await runToolCall(
        { tool: options.tool.name, input: {}, toolUseID: null },
        {
          runID: input.taskID,
          thread: input.taskID,
          tools: [options.tool.name],
          model: noModel,
          stepRunID: buildStepRunID(input),
        },
        {
          registry,
          decide,
          log: options.context.log,
          definitions: options.context.definitions,
          queue: options.queue,

          // the action's outcome reaches the inbox, so the step never waits on it
          queuedWaitMs: 0,
        },
      );
    }

    return {
      next: 'wait',
      records: [],
      acknowledged: input.inbox.map((record) => record.sequence),
    };
  };
}
