import type { JSONObject } from '@heynixie/log';
import type { ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import type { TaskMessaging, TasksContext } from '../types';
import type { ListedTaskState } from './pick-listed-task-state';
import { pickListedTaskState } from './pick-listed-task-state';
import { readListedNextRun } from './read-listed-next-run';
import { readTaskDirectory } from './read-task-directory';
import type { ListedTask } from './read-task-list';
import { readTaskList } from './read-task-list';

const listArguments = z.object({
  state: z.enum(['active', 'waiting', 'done', 'all']).optional(),
  limit: z.int().optional(),
});

const defaultLimit = 20;

type TaskListFilter = NonNullable<z.infer<typeof listArguments>['state']>;

const listedStates: Readonly<Record<TaskListFilter, readonly ListedTaskState[]>> = {
  active: ['ready', 'running'],
  waiting: ['waiting', 'idle', 'asleep', 'paused', 'stopped'],
  done: ['finished', 'done', 'failed', 'closed'],
  all: [
    'ready',
    'running',
    'waiting',
    'idle',
    'asleep',
    'paused',
    'stopped',
    'finished',
    'done',
    'failed',
    'closed',
  ],
};

export function buildTasksListTool(
  context: Pick<TasksContext, 'log' | 'readDefinitionNextFire' | 'readDefinitionVersion'>,
  messaging: Pick<TaskMessaging, 'directory'>,
): ToolDefinition {
  return {
    name: 'tasks.list',
    description:
      'Lists the other tasks you can message with task.message, the most recently active first: ' +
      "each task's ID, name, state, model, brief and last activity, and the ID of the task it " +
      'waits on for a reply, and whether it is wakeable. A task is waiting while it waits on a ' +
      'reply, idle when it waits for a message, asleep when no message wakes it and it waits ' +
      'for its next run, which nextRunAt gives when it has a schedule, and finished once it ' +
      'sent its report and waits for nothing more. Pass state to list only active, waiting ' +
      'or done tasks: waiting also lists idle, asleep, paused and stopped tasks, and done also lists finished, failed and closed ones. A disposable task ' +
      'closes once it reports, and a kept one stays finished until you close it with task.close.',
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
              model: {
                type: ['string', 'null'],
                description: 'the model the task runs on; null for the usual one',
              },
              brief: { type: 'string' },
              lastActivityAt: { type: 'string', description: 'in UTC' },
              wakeable: { type: 'boolean', description: 'whether a message wakes the task' },
              nextRunAt: {
                type: 'string',
                description:
                  'the next scheduled run, in UTC; only on an asleep task with a schedule',
              },
              waitingOn: { type: 'string', description: 'the task this one waits on' },
            },
            required: ['id', 'name', 'state', 'model', 'brief', 'lastActivityAt', 'wakeable'],
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

      const directory = await readTaskDirectory(context, messaging);

      const tasks = await readTaskList(context, directory, {
        callerID: tool.run.thread,
        limit: directory.directory.length,
      });

      const states = listedStates[input.state ?? 'all'];

      const listed = tasks
        .map((task) => ({ task, state: pickListedTaskState(task) }))
        .filter((entry) => states.includes(entry.state))
        .slice(0, input.limit ?? defaultLimit);

      const nextRuns = await Promise.all(
        listed.map((entry) => readListedNextRun(context, entry.task, entry.state)),
      );

      return {
        status: 'ok',
        result: {
          tasks: listed.map((entry, index) =>
            toTaskJSON(entry.task, entry.state, nextRuns[index] ?? null),
          ),
        },
      };
    },
  };
}

function toTaskJSON(
  task: ListedTask,
  state: ListedTaskState,
  nextRunAt: string | null,
): JSONObject {
  return {
    id: task.id,
    name: task.name,
    state,
    model: task.model,
    brief: task.brief,
    lastActivityAt: task.lastActivityAt.toISOString(),
    wakeable: task.wakeable,
    ...(nextRunAt === null ? {} : { nextRunAt }),
    ...(task.waitingOn === undefined ? {} : { waitingOn: task.waitingOn }),
  };
}
