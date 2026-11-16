export type TaskState =
  | 'ready'
  | 'running'
  | 'waiting'
  | 'paused'
  | 'stopped'
  | 'failed'
  | 'done'
  | 'closed';

export type ResumeState = 'ready' | 'waiting';

export type TaskControl = 'pause' | 'resume' | 'stop' | 'restart' | 'close' | 'interrupt';

export type TaskControlRefusal =
  | { readonly reason: 'unknown_task' }
  | { readonly reason: 'conversation_never_closes' }
  | { readonly reason: 'definition_task_never_closes' }
  | { readonly reason: 'runner_lacks_control' }
  | {
      readonly reason: 'at_limit';
      readonly state: TaskState;
      readonly isPauseRequested: boolean;
    }
  | {
      readonly reason: 'not_allowed';
      readonly state: TaskState;
      readonly isPauseRequested: boolean;
    };

export interface TaskControlFacts {
  readonly state: TaskState;
  readonly isConversation: boolean;

  // a task that a definition owns, which nixie never closes
  readonly isDefinitionTask: boolean;
  readonly isPauseRequested: boolean;
  readonly hasUnread: boolean;
  readonly resumeState: ResumeState | null;

  readonly isLimitHeld: boolean;

  // the controls that the task's runner takes
  readonly controls: readonly TaskControl[];
}

export type TaskControlPlan =
  | { readonly kind: 'task.pause_requested' }
  | { readonly kind: 'task.paused'; readonly resumeState: ResumeState }
  | { readonly kind: 'task.resumed'; readonly nextState: ResumeState | 'running' }
  | { readonly kind: 'task.stopped'; readonly resumeState: ResumeState }
  | { readonly kind: 'task.restarted'; readonly nextState: ResumeState }
  | { readonly kind: 'task.closed' }
  | { readonly kind: 'task.interrupted' };

export interface ControlledFields {
  readonly state?: TaskState;
  readonly isPauseRequested?: boolean;
  readonly resumeState?: ResumeState | null;
}
