import type { PinMoveCause, PinState, ToolForm } from '../types';
import { hasAddedProperty } from './has-added-property';

export interface ExistingPin {
  readonly pinnedHash: string | null;
  readonly latestHash: string;
  readonly state: PinState;
}

export interface PinInput {
  readonly isTrusted: boolean;

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
}

// A change the owner learns of after the fact: a trusted server's tool changed, or a listing dropped
// a tool.
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

// Decides what one tool of a passed server listing becomes. The pin only moves in two cases: an
// allow, which another function applies, and a trusted server's change that adds no input property.
// A new tool stays hidden on every server until you allow it.
export function decidePin(input: PinInput): PinDecision {
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
      state: 'hidden_new',
      pinnedHash: null,
      latestHash: hash,
      move: { fromHash: pinnedHash, toHash: null, cause: 'forgotten' },
      propose: { fromHash: null, hash },
      notice: null,
      hiddenReason: null,
    };
  }

  if (input.isTrusted && !hasAddedProperty(input.pinnedForm.inputSchema, input.form.inputSchema)) {
    return {
      state: 'exposed',
      pinnedHash: hash,
      latestHash: hash,
      move: { fromHash: pinnedHash, toHash: hash, cause: 'trusted_change' },
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
  const isChanged = input.existing === null || input.existing.latestHash !== input.hash;

  return {
    state: 'hidden_new',
    pinnedHash: null,
    latestHash: input.hash,
    move: null,
    propose:
      isChanged || input.existing?.state !== 'hidden_new'
        ? { fromHash: null, hash: input.hash }
        : null,
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
