import type { TaskState } from './types';

export type MoveTarget =
  | { readonly kind: 'task'; readonly taskID: string }
  | { readonly kind: 'new'; readonly name: string; readonly brief: string };

export interface MessageMoveFacts {
  readonly messageThread: string | null;
  readonly routedTo: string | null;
  readonly fromState: TaskState | null;
  readonly targetState: TaskState | null;
}

export type MessageMoveRefusal =
  | { readonly reason: 'not_found' }
  | { readonly reason: 'unknown_task' }
  | { readonly reason: 'same_task' }
  | { readonly reason: 'empty_name' }
  | { readonly reason: 'empty_brief' };

export type MessageMovePlan =
  | {
      readonly status: 'move';
      readonly from: string;
      readonly isFromNotified: boolean;
      readonly target: MoveTarget;
    }
  | { readonly status: 'refused'; readonly refusal: MessageMoveRefusal };

export function planMessageMove(target: MoveTarget, facts: MessageMoveFacts): MessageMovePlan {
  if (facts.messageThread === null) {
    return { status: 'refused', refusal: { reason: 'not_found' } };
  }

  const from = facts.routedTo ?? facts.messageThread;
  const refusal = pickTargetRefusal(target, from, facts.targetState);

  if (refusal !== null) {
    return { status: 'refused', refusal };
  }

  return {
    status: 'move',
    from,
    isFromNotified: facts.fromState !== null && !isFinished(facts.fromState),
    target,
  };
}

function pickTargetRefusal(
  target: MoveTarget,
  from: string,
  targetState: TaskState | null,
): MessageMoveRefusal | null {
  if (target.kind === 'new') {
    if (target.name.trim() === '') {
      return { reason: 'empty_name' };
    }

    return target.brief.trim() === '' ? { reason: 'empty_brief' } : null;
  }

  if (targetState === null || isFinished(targetState)) {
    return { reason: 'unknown_task' };
  }

  return target.taskID === from ? { reason: 'same_task' } : null;
}

function isFinished(state: TaskState): boolean {
  return state === 'done' || state === 'failed';
}
