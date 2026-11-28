import type { McpToolOverride } from '@heynixie/policy';
import { pickFitFault } from '../declaration/pick-fit-fault';
import type { PinMoveCause, PinState, ToolForm } from '../types';
import { hasWidenedInput } from './has-widened-input';

export interface ExistingPin {
  readonly pinnedHash: string | null;
  readonly latestHash: string;
  readonly state: PinState;
}

export interface PinInput {
  // null for a tool that no server listing has held
  readonly existing: ExistingPin | null;

  // The form the pin names. Null when the tool has no pin, or when a forget made the form
  // unreadable.
  readonly pinnedForm: ToolForm | null;

  // the form in the newest passed server listing, and its hash
  readonly form: ToolForm;
  readonly hash: string;

  // why the registry refuses the tool's name, or null
  readonly nameRefusal: string | null;

  // The override the definitions give the tool, and the names of the tools the server lists, which
  // the override's fit is judged against. A form that no longer fits leaves the tool stopped.
  readonly override?: McpToolOverride | null;
  readonly serverToolNames?: ReadonlySet<string>;
}

// A change the owner learns of after the fact: a tool's form changed with the same input shape, or a
// listing dropped a tool.
interface PinNotice {
  readonly kind: 'tool_changed' | 'tool_removed';
  readonly fromHash: string | null;
  readonly toHash: string | null;
}

export interface PinDecision {
  readonly state: PinState;
  readonly pinnedHash: string | null;
  readonly latestHash: string;

  // a move of the pin, which the caller records
  readonly move: {
    readonly fromHash: string | null;
    readonly toHash: string | null;
    readonly cause: PinMoveCause;
  } | null;

  // an allow proposal the listing owes: the form you would allow
  readonly propose: { readonly fromHash: string | null; readonly hash: string } | null;

  // the notice the owner reads of a change that applied with no allow, or null
  readonly notice: PinNotice | null;
  readonly hiddenReason: string | null;
}

// Decides what one tool of a passed server listing becomes. A tool with no pin is pinned at its
// first listing. A change that keeps the input's shape moves the pin and leaves a notice, and one
// that widens the input stops the tool until you accept it.
export function decidePin(input: PinInput): PinDecision {
  const decision = decideBasePin(input);
  const override = input.override ?? null;

  if (decision.state !== 'exposed' || override === null) {
    return decision;
  }

  const fault = pickFitFault(override, input.form, input.serverToolNames ?? new Set());

  return fault === null ? decision : { ...decision, state: 'stopped_unfit', hiddenReason: fault };
}

function decideBasePin(input: PinInput): PinDecision {
  const existing = input.existing;
  const hash = input.hash;

  if (input.nameRefusal !== null) {
    return {
      state: 'hidden_new',
      pinnedHash: existing?.pinnedHash ?? null,
      latestHash: hash,
      move: null,
      propose: null,
      notice: null,
      hiddenReason: input.nameRefusal,
    };
  }

  const pinnedHash = existing?.pinnedHash ?? null;

  if (pinnedHash === null) {
    return decideUnpinned(input);
  }

  if (hash === pinnedHash) {
    return {
      state: 'exposed',
      pinnedHash,
      latestHash: hash,
      move: null,
      propose: null,
      notice: null,
      hiddenReason: null,
    };
  }

  if (input.pinnedForm === null) {
    // a forget erased the form the pin names, so there is nothing to compare the change with
    return {
      state: 'exposed',
      pinnedHash: hash,
      latestHash: hash,
      move: { fromHash: pinnedHash, toHash: hash, cause: 'forgotten' },
      propose: null,
      notice: null,
      hiddenReason: null,
    };
  }

  if (!hasWidenedInput(input.pinnedForm.inputSchema, input.form.inputSchema)) {
    return {
      state: 'exposed',
      pinnedHash: hash,
      latestHash: hash,
      move: { fromHash: pinnedHash, toHash: hash, cause: 'changed' },
      propose: null,
      notice: { kind: 'tool_changed', fromHash: pinnedHash, toHash: hash },
      hiddenReason: null,
    };
  }

  return {
    state: 'stopped_changed',
    pinnedHash,
    latestHash: hash,
    move: null,
    propose: { fromHash: pinnedHash, hash },
    notice: null,
    hiddenReason: null,
  };
}

function decideUnpinned(input: PinInput): PinDecision {
  return {
    state: 'exposed',
    pinnedHash: input.hash,
    latestHash: input.hash,
    move: { fromHash: null, toHash: input.hash, cause: 'listed' },
    propose: null,
    notice: null,
    hiddenReason: null,
  };
}

// What a tool becomes when the newest passed listing lacks it. Its pin stays.
export function decideMissingPin(existing: ExistingPin): PinDecision {
  return {
    state: 'removed',
    pinnedHash: existing.pinnedHash,
    latestHash: existing.latestHash,
    move: null,
    propose: null,
    notice:
      existing.state === 'removed'
        ? null
        : {
            kind: 'tool_removed',
            fromHash: existing.pinnedHash ?? existing.latestHash,
            toHash: null,
          },
    hiddenReason: null,
  };
}
