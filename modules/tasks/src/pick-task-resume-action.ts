import type { TaskState } from './types';

export interface TaskResumeFacts {
  readonly task: { readonly state: TaskState; readonly isPauseRequested: boolean } | null;
  readonly isPausedByNixie: boolean;
}

export type TaskResumeAction = 'control' | 'control_then_exempt' | 'exempt';

// An unknown task and a task that nixie's pause does not hold take the built resume. Otherwise a
// task paused on its own is resumed and exempted, and any other task is only exempted.
export function pickTaskResumeAction(facts: TaskResumeFacts): TaskResumeAction {
  if (facts.task === null || !facts.isPausedByNixie) {
    return 'control';
  }

  const isPausedOnItsOwn =
    facts.task.state === 'paused' ||
    (facts.task.state === 'running' && facts.task.isPauseRequested);

  return isPausedOnItsOwn ? 'control_then_exempt' : 'exempt';
}
