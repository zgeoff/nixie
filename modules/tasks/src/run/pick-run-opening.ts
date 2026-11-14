import type { RunOrigin } from './run-origin';
import type { TaskRun } from './types';

export interface RunOpeningFacts {
  // whether the task has the setup of a started task
  readonly isStarted: boolean;
  readonly hasOpenRun: boolean;
  readonly isLimitHeld: boolean;

  // the raise or the restart that is newer than the end of the task's newest task run, which
  // counts only when that task run ended with limit, stopped or failed
  readonly control: { readonly kind: 'raise' | 'restart'; readonly sequence: number } | null;
  readonly newest: TaskRun | null;

  // the first unread waking input of the task
  readonly waking: { readonly kind: RunOrigin; readonly sequence: number } | null;
}

export type RunOpening =
  | { readonly kind: 'none' }
  | { readonly kind: 'join' }
  | { readonly kind: 'hold' }
  | {
      readonly kind: 'open';
      readonly origin: { readonly kind: RunOrigin; readonly sequence: number | null };
      readonly carries: TaskRun | null;
    };

// A claim checks the limit hold, then a raise or a restart, then the unread waking input. A task
// with none of them is one that an earlier release left in flight, so its task run opens with an
// unknown origin.
export function pickRunOpening(facts: RunOpeningFacts): RunOpening {
  if (!facts.isStarted) {
    return { kind: 'none' };
  }

  if (facts.hasOpenRun) {
    return { kind: 'join' };
  }

  if (facts.isLimitHeld) {
    return { kind: 'hold' };
  }

  if (facts.control !== null && facts.newest !== null) {
    return {
      kind: 'open',
      origin: { kind: facts.control.kind, sequence: facts.control.sequence },
      carries: facts.newest,
    };
  }

  if (facts.waking !== null) {
    return { kind: 'open', origin: facts.waking, carries: null };
  }

  return { kind: 'open', origin: { kind: 'unknown', sequence: null }, carries: null };
}
