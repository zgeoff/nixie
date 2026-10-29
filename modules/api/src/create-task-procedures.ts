import { readOwnerMessageTakers, readTaskDirectory, readTaskList } from '@heynixie/tasks';
import { apiImplementer } from './api-implementer';
import { requireCaller } from './require-caller';
import type { APIContext } from './types';

const listLimit = 100;

export function createTaskProcedures(context: APIContext) {
  return {
    list: apiImplementer.tasks.list.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      const directory = await readTaskDirectory(context, {
        directory: context.settings.taskDirectory,
      });

      const tasks = await readTaskList(context, directory, {
        callerID: null,
        state: 'all',
        limit: listLimit,
      });

      const takers = await readOwnerMessageTakers(
        context,
        tasks.map((task) => task.id),
      );

      return {
        tasks: tasks.map((task) => ({
          brief: task.brief,
          isTakingMessages: takers.has(task.id),
          lastActivityAt: task.lastActivityAt,
          name: task.name,
          state: task.state,
          taskID: task.id,
        })),
      };
    }),
  };
}
