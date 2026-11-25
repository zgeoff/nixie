import { taskControls } from '@heynixie/task-control';
import { conversationTaskID } from '../utils/conversation-task-id';
import type { TaskRunnerDefinition } from './types';

// The runner of the conversation's turns. It keeps close in its controls, so that a close of the
// conversation gets its own refusal.
export const conversationRunner: TaskRunnerDefinition = {
  key: 'conversation',
  controls: taskControls,
  start: null,
  fixedTasks: [conversationTaskID],
  keepsSandboxes: true,
  meters: ['turns', 'dollars'],
  ended: null,
  listFields: null,
};
