import type { WriteTransaction } from '../record/with-write-transaction';
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
  // step 1 alone: the start transaction and the hide
  readonly begin: (request: Request, options: ErasureStartOptions) => Promise<ErasureBegin>;

  // begin, then steps 2 to 9; throws when a step fails, and the next start repeats the rest
  readonly run: (request: Request, options: ErasureStartOptions) => Promise<ErasureBegin>;
}

// The runner, as a store or a route sees it.
export interface ErasureRunner {
  // steps 2 to 9 for a begun erasure
  readonly finish: (erasureID: string) => Promise<void>;
}
