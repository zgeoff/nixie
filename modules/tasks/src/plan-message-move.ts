import { isFinishedState } from '@heynixie/task-control';
import type { TaskState } from './types';

export type MoveTarget =
  | { readonly kind: 'task'; readonly taskID: string }
  | { readonly kind: 'new'; readonly name: string; readonly brief: string };

export interface MessageMoveFacts {
  readonly messageThread: string | null;
  readonly routedTo: string | null;
  readonly fromState: TaskState | null;
  readonly targetState: TaskState | null;
  readonly isTargetTakingMessages: boolean;
}

export type MessageMoveRefusal =
  | { readonly reason: 'not_found' }
  | { readonly reason: 'unknown_task' }
  | { readonly reason: 'takes_no_messages' }
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
  const refusal = pickTargetRefusal(target, from, facts);

  if (refusal !== null) {
    return { status: 'refused', refusal };
  }

  return {
    status: 'move',
    from,
    isFromNotified: facts.fromState !== null && !isFinishedState(facts.fromState),
    target,
  };
}

function pickTargetRefusal(
  target: MoveTarget,
  from: string,
  facts: Pick<MessageMoveFacts, 'targetState' | 'isTargetTakingMessages'>,
): MessageMoveRefusal | null {
  if (target.kind === 'new') {
    if (target.name.trim() === '') {
      return { reason: 'empty_name' };
    }

    return target.brief.trim() === '' ? { reason: 'empty_brief' } : null;
  }

  if (facts.targetState === null || isFinishedState(facts.targetState)) {
    return { reason: 'unknown_task' };
  }

  if (!facts.isTargetTakingMessages) {
    return { reason: 'takes_no_messages' };
  }

  return target.taskID === from ? { reason: 'same_task' } : null;
}
