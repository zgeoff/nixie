import { store } from './store';

export function readMockTaskList() {
  const tasks = store.tasks
    .all()
    .toSorted((left, right) => right.lastActivityAt.getTime() - left.lastActivityAt.getTime());

  return {
    readAtSequence: store.records
      .all()
      .reduce((head, record) => Math.max(head, record.sequence), 0),
    tasks: tasks.map((task) => {
      const actions = store.taskActions.findMany((query) => query.where({ taskID: task.taskID }));

      return {
        actions: {
          cancelled: actions.filter((action) => action.isCancelled).length,
          queued: actions.filter((action) => !action.isCancelled && action.attempts === 0).length,
          started: actions.filter((action) => !action.isCancelled && action.attempts > 0).length,
        },
        brief: task.brief,
        controls: [...task.controls],
        isPauseRequested: task.isPauseRequested,
        isTakingMessages: task.isTakingMessages,
        lastActivityAt: task.lastActivityAt,
        name: task.name,
        state: task.state,
        taskID: task.taskID,
        waitingOn: task.waitingOn,
      };
    }),
  };
}
