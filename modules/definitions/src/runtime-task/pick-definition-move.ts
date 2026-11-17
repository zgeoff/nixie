import invariant from 'tiny-invariant';
import type { DefinitionOperation, RuntimeChangeState, RuntimeTaskCause } from '../types';
import type { DefinitionRefusal } from './types';

// One runtime change of a definition, as the decision reads it
export interface DefinitionChangeView {
  readonly changeID: string;
  readonly shortID: string;
  readonly operation: DefinitionOperation;
  readonly hash: string | null;
  readonly previous: string | null;
  readonly base: string | null;
  readonly definitions: string | null;
  readonly replaces: string | null;
  readonly state: RuntimeChangeState;
  readonly cause: RuntimeTaskCause | null;
}

export interface DefinitionState {
  // the repo's version at the last accepted seed; null when it holds none
  readonly repo: string | null;

  // the definition's change with the greatest changed_sequence
  readonly head: DefinitionChangeView | null;

  // the clock reading the caller passes in, epoch milliseconds
  readonly now: number;

  // true when the version in force holds a file-only key at a non-default value, or a file; a
  // define over it is refused
  readonly isFileOnly: boolean;
}

export type DefinitionRequest =
  | {
      readonly kind: 'define';
      readonly definitionID: string;

      // true when the caller named an existing definition to replace
      readonly isReplace: boolean;

      readonly version: {
        readonly hash: string;

        // the time of an `at` trigger, epoch milliseconds
        readonly oneShotAt: number | null;
      };
    }
  | { readonly kind: 'undefine'; readonly definitionID: string }
  | {
      readonly kind: 'undo';

      // the named change; null when none has the ID
      readonly change: DefinitionChangeView | null;
      readonly definitionID: string | null;

      // the one-shot time of the version that rows 2 and 5 put in force; null when it is no one-shot
      readonly restoredOneShotAt: number | null;

      // the seed record that found the repo's other version, for REPO_MOVED
      readonly seedSequence: number;
    };

export interface DefinitionMove {
  readonly status: 'move';
  readonly operation: DefinitionOperation;
  readonly definitionID: string;
  readonly hash: string | null;
  readonly previous: string | null;
  readonly base: string | null;
  readonly definitions: string | null;
  readonly replaces: string | null;
  readonly undoes: string | null;
  readonly caller: 'conversation' | 'owner';
  readonly restored: 'repo' | null;
}

export type DefinitionDecision =
  | DefinitionMove
  | { readonly status: 'refused'; readonly refusal: DefinitionRefusal };

// One decision for a define, an undefine and an undo, so the refusals hold for every caller. It
// compares change IDs only: the caller resolves a short ID first.
export function pickDefinitionMove(
  state: DefinitionState,
  request: DefinitionRequest,
): DefinitionDecision {
  if (request.kind === 'undo') {
    return pickUndoMove(state, request);
  }

  const inForce = pickInForce(state);
  const hashInForce = inForce === null ? state.repo : inForce.hash;

  if (request.kind === 'undefine') {
    return hashInForce === null
      ? refuse({ code: 'NOT_FOUND' })
      : buildMove(state, inForce, {
          operation: 'remove',
          definitionID: request.definitionID,
          hash: null,
        });
  }

  const isTaken = state.repo !== null || (inForce !== null && inForce.hash !== null);

  if (request.isReplace && hashInForce === null) {
    return refuse({ code: 'NOT_FOUND' });
  }

  if (!request.isReplace && isTaken) {
    return refuse({ code: 'ID_TAKEN' });
  }

  if (request.isReplace && state.isFileOnly) {
    return refuse({ code: 'FILE_ONLY_KEYS' });
  }

  if (request.version.hash === hashInForce) {
    return refuse({ code: 'UNCHANGED' });
  }

  if (request.version.oneShotAt !== null && state.repo !== null) {
    return refuse({ code: 'ONE_SHOT_OVER_REPO' });
  }

  return buildMove(state, inForce, {
    operation: request.isReplace ? 'change' : 'add',
    definitionID: request.definitionID,
    hash: request.version.hash,
  });
}

type UndoRequest = Extract<DefinitionRequest, { kind: 'undo' }>;

// The first row of the undo table that fits decides.
function pickUndoMove(state: DefinitionState, request: UndoRequest): DefinitionDecision {
  const change = request.change;

  if (change === null || request.definitionID === null) {
    return refuse({ code: 'NOT_FOUND' });
  }

  const head = state.head;

  invariant(head, 'a definition that holds a change has a head');

  if (head.changeID !== change.changeID) {
    return refuse({
      code: 'REPLACED',
      head: { changeID: head.changeID, shortID: head.shortID, operation: head.operation },
    });
  }

  const undo = { definitionID: request.definitionID, change, state };

  if (change.state === 'in_force') {
    return change.replaces === null
      ? pickBaseUndo(undo)
      : pickOneShotCheckedUndo(undo, request, { hash: change.previous, base: change.base });
  }

  if (change.state === 'adopted') {
    return state.repo === change.hash
      ? pickOneShotCheckedUndo(undo, request, { hash: change.previous, base: change.hash })
      : refuse({ code: 'REPO_MOVED', seedSequence: request.seedSequence });
  }

  // a definition that became a reminder has nothing left to put back
  if (change.cause === 'reminder_moved') {
    return refuse({ code: 'NOT_FOUND' });
  }

  invariant(
    change.cause === 'one_shot_fired' ||
      change.cause === 'one_shot_skipped' ||
      change.cause === 'kept_repo',
    'a retired change has a cause of retiring',
  );

  return refuse({ code: 'NOT_IN_FORCE', cause: change.cause });
}

function refuse(refusal: DefinitionRefusal): DefinitionDecision {
  return { status: 'refused', refusal };
}

interface Undo {
  readonly definitionID: string;
  readonly change: DefinitionChangeView;
  readonly state: DefinitionState;
}

// Rows 3 and 4: the base goes in force, or the repo's version when it moved, and the seed in the
// transaction adopts the undo.
function pickBaseUndo(undo: Undo): DefinitionDecision {
  const change = undo.change;
  const isConflict = change.base !== change.definitions;
  const hash = isConflict ? change.definitions : change.base;

  return buildUndoMove(undo, {
    hash,
    base: hash,
    replaces: change.changeID,
    restored: isConflict ? 'repo' : null,
  });
}

interface UndoVersion {
  readonly hash: string | null;
  readonly base: string | null;
  readonly replaces: string | null;
  readonly restored: 'repo' | null;
}

function buildUndoMove(undo: Undo, version: UndoVersion): DefinitionMove {
  return {
    status: 'move',
    operation: 'undo',
    definitionID: undo.definitionID,
    hash: version.hash,
    previous: undo.change.hash,
    base: version.base,
    definitions: undo.state.repo,
    replaces: version.replaces,
    undoes: undo.change.changeID,
    caller: 'owner',
    restored: version.restored,
  };
}

interface RestoredVersion {
  readonly hash: string | null;
  readonly base: string | null;
}

// Rows 2 and 5 put the earlier version in force as a runtime definition, so a one-shot among them
// follows the one-shot rule.
function pickOneShotCheckedUndo(
  undo: Undo,
  request: UndoRequest,
  restored: RestoredVersion,
): DefinitionDecision {
  if (request.restoredOneShotAt !== null) {
    if (undo.state.repo !== null) {
      return refuse({ code: 'ONE_SHOT_OVER_REPO' });
    }

    if (request.restoredOneShotAt < undo.state.now) {
      return refuse({ code: 'ONE_SHOT_PAST' });
    }
  }

  return buildUndoMove(undo, {
    hash: restored.hash,
    base: restored.base,
    replaces: undo.change.state === 'in_force' ? undo.change.changeID : null,
    restored: null,
  });
}

// A change in force is always the head, because a later change supersedes it.
function pickInForce(state: DefinitionState): DefinitionChangeView | null {
  return state.head?.state === 'in_force' ? state.head : null;
}

interface NewVersion {
  readonly operation: 'add' | 'change' | 'remove';
  readonly definitionID: string;
  readonly hash: string | null;
}

function buildMove(
  state: DefinitionState,
  inForce: DefinitionChangeView | null,
  version: NewVersion,
): DefinitionMove {
  return {
    status: 'move',
    operation: version.operation,
    definitionID: version.definitionID,
    hash: version.hash,
    previous: inForce === null ? state.repo : inForce.hash,
    base: inForce === null ? state.repo : inForce.base,
    definitions: state.repo,
    replaces: inForce?.changeID ?? null,
    undoes: null,
    caller: 'conversation',
    restored: null,
  };
}
