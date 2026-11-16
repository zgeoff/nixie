import type { RunOrigin } from './run-origin';
import type { RunPhase, TaskRun } from './types';

export interface UnreadFire {
  readonly sequence: number;
  readonly dedupeKey: string;
  readonly definitionHash: string;
}

export interface RunDefinitionFacts {
  // the task run that has not ended, with its phase
  readonly open: { readonly phase: RunPhase } | null;
  readonly isLimitHeld: boolean;

  // the raise or the restart that is newer than the end of the newest task run, which counts only
  // when that task run ended with limit, stopped or failed
  readonly control: { readonly kind: 'raise' | 'restart'; readonly sequence: number } | null;
  readonly newest: TaskRun | null;

  // the unread trigger.fired records that decode, oldest first
  readonly fires: readonly UnreadFire[];

  // the dedupe keys that a task run of the task holds
  readonly heldKeys: ReadonlySet<string>;

  // the first unread waking record that is no fire
  readonly waking: { readonly kind: RunOrigin; readonly sequence: number } | null;

  // null while the definition is out of force
  readonly hashInForce: string | null;
}

export type RunDefinitionPick =
  | { readonly kind: 'none' }
  | { readonly kind: 'join' }
  | { readonly kind: 'hold' }
  | {
      readonly kind: 'open';
      readonly origin: { readonly kind: RunOrigin; readonly sequence: number };

      // the hash the new task run pins, and the key it holds, unless it carries a task run
      readonly definitionHash: string;
      readonly triggerKey: string | null;
      readonly carries: TaskRun | null;

      // whether the idle open task run ends first
      readonly isEndingOpen: boolean;
    };

// With an open task run the claim joins it, unless it is idle and an unread fire waits. Without
// one, a limit hold stops the claim, and then the first of a fire, a raise or a restart, and a
// waking message decides.
export function pickRunDefinition(facts: RunDefinitionFacts): RunDefinitionPick {
  const fire = facts.fires.findLast((candidate) => !facts.heldKeys.has(candidate.dedupeKey));

  if (facts.open !== null) {
    return facts.open.phase === 'idle' && fire !== undefined
      ? buildFireOpening(fire, true)
      : { kind: 'join' };
  }

  if (facts.isLimitHeld) {
    return { kind: 'hold' };
  }

  if (fire !== undefined) {
    return buildFireOpening(fire, false);
  }

  if (facts.control !== null && facts.newest !== null) {
    return {
      kind: 'open',
      origin: { kind: facts.control.kind, sequence: facts.control.sequence },
      definitionHash: facts.newest.opened.definitionHash ?? '',
      triggerKey: facts.newest.opened.triggerKey,
      carries: facts.newest,
      isEndingOpen: false,
    };
  }

  if (facts.waking !== null && facts.hashInForce !== null) {
    return {
      kind: 'open',
      origin: facts.waking,
      definitionHash: facts.hashInForce,
      triggerKey: null,
      carries: null,
      isEndingOpen: false,
    };
  }

  return { kind: 'none' };
}

function buildFireOpening(fire: UnreadFire, isEndingOpen: boolean): RunDefinitionPick {
  return {
    kind: 'open',
    origin: { kind: 'trigger', sequence: fire.sequence },
    definitionHash: fire.definitionHash,
    triggerKey: fire.dedupeKey,
    carries: null,
    isEndingOpen,
  };
}
