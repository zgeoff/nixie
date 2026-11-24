import type { AsyncLocalStorage } from 'node:async_hooks';
import type { Clock } from '@heynixie/clock';
import type { JSONObject } from '@heynixie/log';
import type { Sandbox } from '@heynixie/sandbox';
import type { ComputerReply, ComputerRequest } from '@heynixie/wire';
import type { GuestSession } from './make-guest-session';
import type { ComputerOptions } from './start-computer';
import type { Takeover } from './takeover/types';
import type { RunningCall } from './takeover/wait-for-running-calls';

export interface DesktopState {
  sandbox: Sandbox | null;
  guest: GuestSession | null;
  isAsleep: boolean;

  // true once no sandbox of an earlier release is left, in this process
  isMoved: boolean;

  // the end of the chain of calls, which holds the sandbox one call at a time
  turn: Promise<void>;
  holds: number;
  idle: AbortController | null;
  readonly tabs: Map<string, string>;
  tabCount: number;

  readonly idleClosed: Set<string>;

  // the watches open now, which hold no turn
  readonly watches: { count: number };

  // the calls from the tools, which a take-over waits for
  readonly running: Set<RunningCall>;

  // the actions' calls admitted past the hold, which count among the running calls
  readonly admitted: Set<RunningCall>;

  // the admission whose work runs now, so a computer call moves the limit of its own admission
  readonly scope: AsyncLocalStorage<RunningCall>;
  takeover: Takeover | null;
}

export interface ComputerContext {
  readonly options: ComputerOptions;
  readonly clock: Clock;
  readonly state: DesktopState;
}

// the server's verdict on a URL a guest is about to request
export type ScanVerdict =
  | { readonly kind: 'pass' }
  | { readonly kind: 'refuse'; readonly reason: string };

export type ComputerScan = (url: string) => Promise<ScanVerdict>;

// A call ends in one of these. A guest's reply carries the reason a hop was refused, if one was.
export type CallResult =
  | { readonly status: 'reply'; readonly reply: ComputerReply; readonly refusal: string | null }

  // another call held the sandbox for the whole wait
  | { readonly status: 'busy' }

  // the browser and shell sandboxes of an earlier release are not yet copied into the computer
  | { readonly status: 'moving' }

  // the kernel killed a process of the sandbox for memory during the call
  | { readonly status: 'out_of_memory' }

  // the sandbox or the guest broke, or the guest passed its time limit
  | { readonly status: 'failed'; readonly message: string };

export interface ComputerCall {
  readonly request: ComputerRequest;
  readonly scan: ComputerScan;

  // scans the headers and body of a request a guest is about to send
  readonly scanText: ComputerScan;

  // the longest the guest may take after its turn starts
  readonly timeoutMs: number;
}

// the tool and the arguments of a queued call, as its action holds them
export interface ComputerAttempt {
  readonly tool: string;
  readonly arguments: JSONObject;

  // the destinations the policy checked for the call
  readonly destinations: readonly string[];

  // the hash the action is queued under, and the deadline it covers
  readonly actionHash: string;
  readonly deadlineAt: number | null;
}
