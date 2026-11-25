import type { WriteTransaction } from '../record/with-write-transaction';
import type { Definitions, Log } from '../types';
import type { ErasableKind } from './erasable-kind';
import type { ErasureCapture } from './erasure-capture-schema';

export interface LegacyEnd {
  readonly kind: string;
  readonly where?: Readonly<Record<string, string>>;
}

export interface ErasableDescriptor {
  readonly kind: ErasableKind;
  readonly recordKinds: {
    // records this erasable's own forget erases
    readonly erasable: readonly string[];

    // records a record forget may target (the record erasable only)
    readonly forgettable: readonly string[];

    // records no forget may target, such as definition.changed
    readonly unforgettable: readonly string[];
  };

  // The old end records that make a backup due. The server passes these to the backup module, which
  // imports no store.
  readonly legacyEnds: readonly LegacyEnd[];
}

// targetID is the target's stable ID: a UUID, a record's sequence as text, or the conversation's
// task ID. The model never sees it.
export interface ErasureTarget {
  readonly kind: ErasableKind;
  readonly targetID: string;
  readonly version: number | null;
}

export type ErasureBy = 'user' | 'assistant';

// What a store's start returns after it checked the target and read what the erasure must delete.
export interface ErasureStart {
  readonly target: ErasureTarget;
  readonly shortID: string | null;
  readonly capture: ErasureCapture;
}

// The methods a store attaches to its descriptor when it moves onto the runner. `Request` is what a
// caller asks for, such as a note's short ID or UUID with the version the client saw.
export interface Erasable<Request> {
  // Throws the store's refusal error, so a client action written in the same transaction rolls
  // back: not_found, stale.
  readonly start: (tx: WriteTransaction, request: Request) => Promise<ErasureStart>;

  // After the start commits: makes the target unreachable at once, such as dropping it from search.
  readonly hide: (target: ErasureTarget) => Promise<void>;
  readonly readChildren: (tx: WriteTransaction, target: ErasureTarget) => Promise<ErasureTarget[]>;

  // The request that starts a child erasure from a target that readChildren found.
  readonly toRequest: (target: ErasureTarget) => Request;

  // Optional. After the start commits and before any key goes: sends the target's one revocation
  // and records its outcome. It runs on every run of the tree, so it sends nothing once recorded.
  readonly revoke?: (target: ErasureTarget) => Promise<void>;

  // After the keys go; repeats hide's work safely.
  readonly cleanIndexes: (target: ErasureTarget) => Promise<void>;

  // A forget the store's old pipeline left open at the first start: the requests that have no
  // erasure.started yet. The runner starts each one from its current state.
  readonly readLegacyOpen?: () => Promise<readonly { request: Request; by: ErasureBy }[]>;
}

// The store's own erasable, with its descriptor.
export type RegisteredErasable<Request> = ErasableDescriptor & Erasable<Request>;

export interface ErasureStartOptions {
  readonly by: ErasureBy;

  // runs inside the start transaction, so a refusal rolls it back
  readonly writeInTransaction?: (tx: WriteTransaction) => Promise<void>;
}

export type ErasureBegin =
  | { readonly status: 'refused'; readonly reason: 'not_found' | 'stale' }
  | {
      readonly status: 'begun';
      readonly erasureID: string;
      readonly target: ErasureTarget;
      readonly shortID: string | null;
    };

// What a store or a route holds for its own kind. The server's runner hands one out when the store
// registers its erasable.
export interface ErasureHandle<Request> {
  // step 1: the start transaction, then the hide. A refusal comes back as a value; any other error
  // from the caller's hook rolls the transaction back and throws.
  readonly begin: (request: Request, options: ErasureStartOptions) => Promise<ErasureBegin>;

  // steps 2 to 9 for the open erasure of a target, or nothing when it has none; throws when a step
  // fails
  readonly finish: (targetID: string) => Promise<void>;
}

// What a store receives to register its erasable at start.
export interface ErasureRegistry {
  readonly register: <Request>(erasable: RegisteredErasable<Request>) => ErasureHandle<Request>;
}

// A registered erasable with its request type closed over, so the runner starts any kind from a
// target alone.
export interface ErasureEntry {
  readonly descriptor: ErasableDescriptor;
  readonly hide: (target: ErasureTarget) => Promise<void>;
  readonly revoke: (target: ErasureTarget) => Promise<void>;
  readonly readChildren: (tx: WriteTransaction, target: ErasureTarget) => Promise<ErasureTarget[]>;
  readonly cleanIndexes: (target: ErasureTarget) => Promise<void>;
  readonly beginChild: (target: ErasureTarget, parent: ErasureParent) => Promise<ErasureBegin>;
  readonly beginLegacy: () => Promise<void>;
}

export interface ErasureParent {
  readonly erasureID: string;
  readonly by: ErasureBy;
}

// What the runner's writes need of the log.
export interface ErasureLogContext {
  readonly log: Log;
  readonly definitions: () => Definitions;
}
