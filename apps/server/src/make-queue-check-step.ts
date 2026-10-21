import { makeDecisionPoint } from '@heynixie/policy';
import type { RunStep, TasksContext } from '@heynixie/tasks';
import { buildStepRunID } from '@heynixie/tasks';
import type { ActionQueue, ToolDefinition } from '@heynixie/tools';
import { buildToolRegistry, runToolCall } from '@heynixie/tools';

export interface QueueCheckStepOptions {
  readonly context: TasksContext;
  readonly queue: ActionQueue;

  readonly tool: ToolDefinition;
}

const noModel = { model: 'none', profile: 'none' };

export function makeQueueCheckStep(options: QueueCheckStepOptions): RunStep {
  const registry = buildToolRegistry([options.tool]);

  const decide = makeDecisionPoint({
    findDeclaration: (name) => registry.findTool(name)?.definition.declaration ?? null,
  });

  return async (input) => {
    const wake = input.inbox.findLast((record) => record.kind === 'task.wake');

    if (wake !== undefined) {
      await runToolCall(
        { tool: options.tool.name, input: { wake: wake.sequence }, toolUseID: null },
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
