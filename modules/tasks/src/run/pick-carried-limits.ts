import type { TaskLimits, TaskUsage } from '../types';
import type { RunLimits, TaskRun } from './types';

export interface CarriedLimitsFacts {
  readonly kind: 'raise' | 'restart';

  // the first task run of the piece of work, whose pinned values are the totals without a raise
  readonly first: TaskRun;

  // the totals of the newest raise since the piece of work began, or null when it has none
  readonly raised: TaskLimits | null;

  // the piece of work's use since its newest restart
  readonly used: TaskUsage;
}

// A raise sets a new total for the piece of work, so the carried task run gets the total less what
// the piece used since its newest restart. A restart gets the full totals, because a restart after a
// limit end would otherwise carry nothing and end before its first turn.
export function pickCarriedLimits(facts: CarriedLimitsFacts): RunLimits {
  const pinned = facts.first.opened.limits;
  const totals = facts.raised ?? { turns: pinned.turns, dollars: pinned.dollars };

  if (facts.kind === 'restart') {
    return { turns: totals.turns, dollars: totals.dollars, calls: pinned.calls };
  }

  return {
    turns: totals.turns === null ? null : Math.max(0, totals.turns - facts.used.turns),
    dollars: totals.dollars === null ? null : Math.max(0, totals.dollars - facts.used.dollars),
    calls: pinned.calls,
  };
}
