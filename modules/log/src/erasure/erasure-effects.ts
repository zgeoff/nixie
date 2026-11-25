import type { WriteTransaction } from '../record/with-write-transaction';
import type { ErasureCapture } from './erasure-capture-schema';

export type ErasureFaultPoint =
  | 'erasure.begun'
  | 'erasure.sandboxes_destroyed'
  | 'erasure.revoked'
  | 'erasure.keys_removed'
  | 'erasure.cleaned'
  | 'erasure.turn_inputs_removed';

export type ErasureSessionCause = ErasureCapture['sessionCause'];

export interface ErasureTurnInputScope {
  // every request on these threads goes
  readonly threads: readonly string[];

  // on any other thread, every request taken in at or after this sequence goes; null removes every
  // request on every thread
  readonly fromSequence: number | null;
}

// What the runner reaches outside the log: the sessions, the turn inputs and the sandboxes. The
// server supplies each one, because only it reaches them all. Each call is safe to run again.
export interface ErasureEffects {
  // closes every open turn-input capture on every thread, and throws when a shred failed
  readonly closeCaptures: () => Promise<void>;

  // no capture opens while any erasure holds capture closed; each call is keyed by erasure ID
  readonly holdCaptures: (erasureID: string) => void;
  readonly releaseCaptures: (erasureID: string) => void;

  // destroys the code sandboxes that hold clear text, and throws when one will not go
  readonly destroySandboxes: (callIDs: readonly string[]) => Promise<void>;

  // invalidates each session that can hold the target's text
  readonly cleanupSessions: (cause: ErasureSessionCause) => Promise<void>;

  // the threads whose sessions the cleanup closed, which the turn inputs on them follow
  readonly readCleanedThreads: (cause: ErasureSessionCause) => Promise<readonly string[]>;

  // finishes the evidence purge of a forgotten record, after its erasure's sessions are clean
  readonly finishPurges: (recordSequence: number) => Promise<void>;

  readonly removeTurnInputs: (scope: ErasureTurnInputScope) => Promise<void>;

  // runs in the transaction that writes erasure.finished, after the record: no backup set that
  // started before it may publish from then on
  readonly writeBackupFloor: (tx: WriteTransaction) => Promise<void>;

  // holds the runner at a fault point of the test build
  readonly reachFaultPoint: (point: ErasureFaultPoint, erasureID: string) => Promise<void>;
}
