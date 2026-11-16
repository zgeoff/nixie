import type { ContractInputs } from '@heynixie/contract';
import { probeMockTaskPaused } from './probe-mock-task-paused';
import { store } from './store';

const listLimit = 100;

export function readMockTaskList(input: ContractInputs['tasks']['list'] = {}) {
  const tasks = store.tasks
    .all()
    .toSorted((left, right) => right.lastActivityAt.getTime() - left.lastActivityAt.getTime())
    .filter((task) => input.definitionID === undefined || task.definitionID === input.definitionID)
    .filter(
      (task) => input.states === undefined || input.states.includes(readMockListedState(task)),
    )
    .slice(0, listLimit);

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
        closedBy: task.closedBy,
        controls: [...task.controls],
        definitionID: task.definitionID,
        disposable: task.disposable,
        fire: task.fire,
        isPauseRequested: task.isPauseRequested,
        isPausedByNixie: probeMockTaskPaused(task.taskID),
        isTakingMessages: task.isTakingMessages,
        lastActivityAt: task.lastActivityAt,
        listedState: task.listedState === undefined ? undefined : readMockListedState(task),
        name: task.name,
        nextRunAt: task.nextRunAt,
        runner: task.runner,
        state: task.state,
        taskID: task.taskID,
        wakeable: task.wakeable,
        waitingOn: task.waitingOn,
      };
    }),
  };
}

const pausableStates: ReadonlySet<string> = new Set(['ready', 'running', 'waiting', 'paused']);

// The API's rule: a task that nixie's pause holds lists as paused, unless it has ended.
type MockTask = ReturnType<typeof store.tasks.all>[number];

function readMockListedState(task: MockTask) {
  const own = task.listedState ?? task.state;

  return pausableStates.has(task.state) && probeMockTaskPaused(task.taskID) ? 'paused' : own;
}
