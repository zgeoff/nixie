import type { TasksContext } from '../types';
import { seedClosedTask } from './seed-closed-task';
import { seedConversationStep } from './seed-conversation-step';
import { seedDoneConversationTask } from './seed-done-conversation-task';
import { seedDoneTask } from './seed-done-task';
import { seedDriftedTask } from './seed-drifted-task';
import { seedFailedConversationTurn } from './seed-failed-conversation-turn';
import { seedFailedTask } from './seed-failed-task';
import { seedGoneHolderLease } from './seed-gone-holder-lease';
import { seedPausedTask } from './seed-paused-task';
import type { PausedTaskSeed } from './seed-paused-task';
import { seedRunningTask } from './seed-running-task';
import { seedStoppedTask } from './seed-stopped-task';
import { seedSystemTaskAtHop } from './seed-system-task-at-hop';
import type { SystemTaskAtHopSeed } from './seed-system-task-at-hop';
import { seedTask } from './seed-task';
import type { StartedTaskSeed } from './seed-task';
import { seedWaitingTask } from './seed-waiting-task';

export interface TaskSeederDeps {
  readonly context: TasksContext;
}

export function buildTaskSeeder(deps: TaskSeederDeps) {
  return {
    conversationStep: () => seedConversationStep(deps.context),
    doneConversationTask: () => seedDoneConversationTask(deps.context),
    failedConversationTurn: () => seedFailedConversationTurn(deps.context),
    task: (input: StartedTaskSeed) => seedTask(deps.context, input),
    runningTask: (input: StartedTaskSeed) => seedRunningTask(deps.context, input),
    waitingTask: (input: StartedTaskSeed) => seedWaitingTask(deps.context, input),
    pausedTask: (input: PausedTaskSeed) => seedPausedTask(deps.context, input),
    stoppedTask: (input: StartedTaskSeed) => seedStoppedTask(deps.context, input),
    driftedTask: (taskID: string) => seedDriftedTask(deps.context, taskID),
    goneHolderLease: (taskID: string) => seedGoneHolderLease(deps.context, taskID),
    systemTaskAtHop: (input: SystemTaskAtHopSeed) => seedSystemTaskAtHop(deps.context, input),
    failedTask: (input: StartedTaskSeed) => seedFailedTask(deps.context, input),
    doneTask: (input: StartedTaskSeed) => seedDoneTask(deps.context, input),
    closedTask: (input: StartedTaskSeed) => seedClosedTask(deps.context, input),
  };
}
