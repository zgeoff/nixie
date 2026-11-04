import type { TaskLimits } from './types';

export interface TaskLimitRaiseFacts {
  readonly isKnown: boolean;
  readonly heldAt: TaskLimits | null;
}

export interface AskedLimits {
  readonly turns?: number | undefined;
  readonly dollars?: number | undefined;
}

export type TaskLimitRaiseRefusal = 'unknown_task' | 'not_held' | 'not_raised';

export type TaskLimitRaisePlan =
  | { readonly status: 'planned'; readonly limits: TaskLimits }
  | { readonly status: 'refused'; readonly reason: TaskLimitRaiseRefusal };

export function planTaskLimitRaise(
  facts: TaskLimitRaiseFacts,
  asked: AskedLimits,
): TaskLimitRaisePlan {
  if (!facts.isKnown) {
    return { status: 'refused', reason: 'unknown_task' };
  }

  const held = facts.heldAt;

  if (held === null) {
    return { status: 'refused', reason: 'not_held' };
  }

  const limits = { turns: asked.turns ?? held.turns, dollars: asked.dollars ?? held.dollars };
  const isLower = limits.turns < held.turns || limits.dollars < held.dollars;
  const isSame = limits.turns === held.turns && limits.dollars === held.dollars;

  if (isLower || isSame) {
    return { status: 'refused', reason: 'not_raised' };
  }

  return { status: 'planned', limits };
}
