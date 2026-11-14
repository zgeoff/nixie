import type { TaskControl } from '@heynixie/task-control';
import { isControlAllowed } from '@heynixie/task-control';
import type { ListedTask } from '../task/use-live-task-list';
import { isTaskShownPaused } from './is-task-shown-paused';

// A task that nixie's pause holds offers its own resume, which the task's state alone does not.
export function collectOfferedControls(task: ListedTask): readonly TaskControl[] {
  const allowed = task.controls.filter((control) =>
    isControlAllowed(control, {
      isConversation: task.taskID === 'conversation',
      isPauseRequested: task.isPauseRequested,
      state: task.state,
    }),
  );

  const isResumeMissing = !allowed.includes('resume') && task.controls.includes('resume');

  return isTaskShownPaused(task) && isResumeMissing ? ['resume', ...allowed] : allowed;
}
