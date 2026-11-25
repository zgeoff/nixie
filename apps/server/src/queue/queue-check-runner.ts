import type { TaskRunnerDefinition } from '@heynixie/tasks';
import { taskControls } from '@heynixie/tasks';
import { queueCheckTaskID } from './queue-check-task-id';

export const queueCheckRunner: TaskRunnerDefinition = {
  key: 'queue-check',
  controls: taskControls,
  start: null,
  fixedTasks: [queueCheckTaskID],
  keepsSandboxes: false,
  meters: ['turns', 'dollars'],
  ended: null,
  listFields: null,
};
