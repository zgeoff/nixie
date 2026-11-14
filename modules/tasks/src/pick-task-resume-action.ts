import type { TaskState } from './types';

export interface TaskResumeFacts {
  readonly task: { readonly state: TaskState; readonly isPauseRequested: boolean } | null;
  readonly isPausedByNixie: boolean;
}

export type TaskResumeAction = 'control' | 'control_then_exempt' | 'exempt';

export function pickTaskResumeAction(facts: TaskResumeFacts): TaskResumeAction {
  if (facts.task === null || !facts.isPausedByNixie) {
    return 'control';
  }

  const isPausedOnItsOwn =
    facts.task.state === 'paused' ||
    (facts.task.state === 'running' && facts.task.isPauseRequested);

  return isPausedOnItsOwn ? 'control_then_exempt' : 'exempt';
}
