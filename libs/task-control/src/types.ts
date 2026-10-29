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
  | {
      readonly reason: 'not_allowed';
      readonly state: TaskState;
      readonly isPauseRequested: boolean;
    };

export interface TaskControlFacts {
  readonly state: TaskState;
  readonly isConversation: boolean;
  readonly isPauseRequested: boolean;
  readonly hasUnread: boolean;
  readonly resumeState: ResumeState | null;
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
