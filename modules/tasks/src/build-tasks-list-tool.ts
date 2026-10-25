import type { JSONObject } from '@heynixie/log';
import type { ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import type { ListedTask } from './read-task-list';
import { readTaskList } from './read-task-list';
import type { TaskMessaging, TasksContext } from './types';

const listArguments = z.object({
  state: z.enum(['active', 'waiting', 'done', 'all']).optional(),
  limit: z.int().optional(),
});

const defaultLimit = 20;

export function buildTasksListTool(
  context: Pick<TasksContext, 'log'>,
  messaging: Pick<TaskMessaging, 'directory'>,
): ToolDefinition {
  return {
    name: 'tasks.list',
    description:
      'Lists the other tasks you can message with task.message, the most recently active first: ' +
      "each task's ID, name, state, brief and last activity, and the ID of the task it waits on " +
      'for a reply. Pass state to list only active, waiting or done tasks.',
    input: {
      type: 'object',
      properties: {
        state: { type: 'string', enum: ['active', 'waiting', 'done', 'all'] },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
      },
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              state: { type: 'string' },
              brief: { type: 'string' },
              lastActivityAt: { type: 'string', description: 'in UTC' },
              waitingOn: { type: 'string', description: 'the task this one waits on' },
            },
            required: ['id', 'name', 'state', 'brief', 'lastActivityAt'],
            additionalProperties: false,
          },
        },
      },
      required: ['tasks'],
      additionalProperties: false,
    },
    declaration: {
      effects: ['read'],
      destinations: [],
      amount: null,
      content: [],
      results: { tasks: 'owner_data' },
    },
    execution: 'direct',
    run: async (call, tool) => {
      const input = listArguments.parse(call.input);

      const tasks = await readTaskList(context, messaging, {
        callerID: tool.run.thread,
        state: input.state ?? 'all',
        limit: input.limit ?? defaultLimit,
      });

      return { status: 'ok', result: { tasks: tasks.map((task) => toTaskJSON(task)) } };
    },
  };
}

function toTaskJSON(task: ListedTask): JSONObject {
  const listed = {
    id: task.id,
    name: task.name,
    state: task.state,
    brief: task.brief,
    lastActivityAt: task.lastActivityAt.toISOString(),
  };

  return task.waitingOn === undefined ? listed : { ...listed, waitingOn: task.waitingOn };
}
