import type { ToolDefinition, ToolOutcome } from '@heynixie/tools';
import { match } from 'ts-pattern';
import { z } from 'zod';
import type { TaskMessaging, TasksContext } from '../types';
import { getTaskName } from './get-task-name';
import type { TaskCloseRefusal } from './plan-task-close';
import { readTaskDirectory } from './read-task-directory';
import { writeTaskClose } from './write-task-close';

const closeArguments = z.object({ taskID: z.string() });

export function buildTaskCloseTool(
  context: Pick<TasksContext, 'clock' | 'definitions' | 'log' | 'runSettings' | 'runners'>,
  messaging: Pick<TaskMessaging, 'directory'>,
): ToolDefinition {
  return {
    name: 'task.close',
    description:
      'Closes a task you started that has finished or that you no longer need, by the ID that ' +
      'tasks.list gives. A closed task keeps its records and stays listed, but it takes no ' +
      'messages and cannot resume. It refuses a task that is still working, and any task you ' +
      'did not start. Closing a closed task changes nothing.',
    input: {
      type: 'object',
      properties: { taskID: { type: 'string', description: 'the ID of the task to close' } },
      required: ['taskID'],
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: {
        taskID: { type: 'string' },
        name: { type: 'string' },
        state: { type: 'string', const: 'closed' },
        wasClosed: { type: 'boolean', description: 'true when the task was already closed' },
      },
      required: ['taskID', 'name', 'state', 'wasClosed'],
      additionalProperties: false,
    },
    declaration: {
      effects: ['note'],
      destinations: [],
      amount: null,
      content: [],
      results: {
        taskID: 'owner_data',
        name: 'owner_data',
        state: 'owner_data',
        wasClosed: 'owner_data',
      },
    },
    execution: 'direct',
    run: async (call, tool): Promise<ToolOutcome> => {
      const input = closeArguments.parse(call.input);

      const outcome = await writeTaskClose(context, {
        from: tool.run.thread,
        taskID: input.taskID,
        stepRunID: tool.run.stepRunID ?? null,
      });

      if (outcome.status === 'refused') {
        return { status: 'error', message: renderRefusal(input.taskID, outcome.refusal) };
      }

      const directory = await readTaskDirectory(context, messaging);

      return {
        status: 'ok',
        result: {
          taskID: input.taskID,
          name: getTaskName(directory, input.taskID),
          state: 'closed',
          wasClosed: outcome.wasClosed,
        },
      };
    },
  };
}

function renderRefusal(taskID: string, refusal: TaskCloseRefusal): string {
  return match(refusal)
    .with(
      { reason: 'unknown_task' },
      () => `no task you can close has the ID ${taskID}; tasks.list gives the IDs`,
    )
    .with(
      { reason: 'own_task' },
      () => `${taskID} is your own task, and a task cannot close itself`,
    )
    .with({ reason: 'conversation' }, () => `${taskID} is the conversation, which never closes`)
    .with(
      { reason: 'not_started' },
      () => `${taskID} is not a task that was started, so it cannot be closed`,
    )
    .with(
      { reason: 'still_working' },
      () => `${taskID} is still working, so nixie closed nothing; close it once it has finished`,
    )
    .with(
      { reason: 'stale_step' },
      () => 'this call comes from a step that no longer holds its task, so nixie closed nothing',
    )
    .exhaustive();
}
