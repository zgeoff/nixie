import type { TakeoverNow } from '@heynixie/wire';
import type { WatchConnection } from '../watch/types';

// What ended a hold. A hold the assistant ends, which a later change builds, is `assistant`.
export type TakeoverEnd = 'user' | 'assistant' | 'idle' | 'restart';

// What the guest saw during a hold: the sites the browser showed, and the window in focus at its end
export interface HandBackRead {
  readonly origins: readonly string[];
  readonly now: TakeoverNow;
}

export interface TakeoverEndedRecord {
  readonly by: TakeoverEnd;
  readonly durationSeconds: number;

  // absent for a restart, which reads nothing from the guest
  readonly read: HandBackRead | null;
}

// The records a hold writes, on the conversation's thread.
interface TakeoverStartedRecord {
  readonly device: string;
}

export interface TakeoverRecords {
  readonly writeStarted: (input: TakeoverStartedRecord) => Promise<void>;
  readonly writeEnded: (input: TakeoverEndedRecord) => Promise<void>;
}

export type TakeOverResult =
  | { readonly kind: 'started'; readonly takenOverAt: number }
  | { readonly kind: 'busy_too_long' }
  | { readonly kind: 'held_elsewhere' };

export type HandBackResult =
  | { readonly kind: 'ended'; readonly durationSeconds: number }
  | { readonly kind: 'not_taken_over' };

export interface Takeover {
  // True from the moment a take-over is called until the hold has ended, and so while the assistant's
  // new calls and claims wait. The hold lives in memory alone.
  readonly isHeld: () => boolean;

  // Rises when a hold starts and when it ends, so a call prepared before either can tell that the
  // desktop was in a person's hands since.
  readonly epoch: () => number;

  // true while the device holds the desktop and its input passes
  readonly isHolder: (deviceID: string) => boolean;

  // Starts a hold for the device. It waits for the calls already running, up to their own limit.
  readonly start: (deviceID: string) => Promise<TakeOverResult>;

  // Ends the hold. A `user` end, and any end that names a device, counts only for the device that
  // holds it.
  readonly end: (by: TakeoverEnd, deviceID?: string) => Promise<HandBackResult>;

  // notes input from the device, which holds off the idle hand-back
  readonly touch: (deviceID: string) => void;

  // Registers a watch of the device, so the end of its hold drops the input that watch still holds.
  // It returns the function that removes the watch.
  readonly addWatch: (deviceID: string, watch: WatchConnection) => () => void;

  // stops the idle timer, for a computer that stops
  readonly stop: () => void;
}

// what a device session calls to take the desktop and give it back, and what an action's call
// passes to start
export interface ComputerTakeover extends Pick<Takeover, 'isHeld' | 'epoch' | 'start' | 'end'> {
  // Lets an action's call start unless a hold is open, and counts it as a running call that a
  // take-over waits for until the returned function runs. It answers null while a hold is open.
  readonly admit: () => (() => void) | null;
}
