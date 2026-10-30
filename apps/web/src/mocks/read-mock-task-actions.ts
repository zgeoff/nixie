import { store } from './store';

export function readMockTaskActions(taskID: string) {
  if (store.tasks.findFirst((query) => query.where({ taskID })) === undefined) {
    return null;
  }

  const pending = store.taskActions
    .findMany((query) => query.where({ taskID }))
    .filter((action) => !action.isCancelled);

  return {
    queued: pending
      .filter((action) => action.attempts === 0)
      .map((action) => ({ actionID: action.actionID, tool: action.tool })),
    started: pending
      .filter((action) => action.attempts > 0)
      .map((action) => ({ actionID: action.actionID, tool: action.tool })),
  };
}
