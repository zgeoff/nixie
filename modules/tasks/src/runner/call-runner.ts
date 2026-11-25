import { callRunnerKey } from '../call/call-task-options';
import type { TaskRunnerDefinition } from './types';

// The runner of a voice call's thread. No start tool picks it: the calls module creates its task
// when a call opens. A call holds one sandbox from its connect to its end, runs no meter, and takes
// no pause, because a call that waits is a call that hangs.
export const callRunner: TaskRunnerDefinition = {
  key: callRunnerKey,
  controls: ['stop', 'close', 'interrupt'],
  start: null,
  fixedTasks: [],
  keepsSandboxes: true,
  meters: [],
  ended: null,
  listFields: null,
};
