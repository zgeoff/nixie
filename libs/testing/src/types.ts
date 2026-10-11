// The messages between the crash harness in the test process and the nixie process it runs, over
// Bun's IPC channel, as JSON.

// Which work reached a fault point: the FaultPointContext of modules/tasks, which a lib cannot
// import.
export interface FaultPointWork {
  readonly kind: string;
  readonly id: string | null;
}

// A fault point the harness holds a runner at: every arrival at the point, or only the arrivals of
// one kind or one piece of work, up to times arrivals (1 by default).
export interface FaultPointArm {
  readonly point: string;
  readonly kind?: string;
  readonly workID?: string;
  readonly times?: number;
}

export type NixieMessage =
  | { readonly type: 'ready' }
  | {
      readonly type: 'arrived';
      readonly arrivalID: number;
      readonly point: string;
      readonly work: FaultPointWork;
    }
  | {
      readonly type: 'reply';
      readonly requestID: number;
      readonly result?: unknown;
      readonly error?: string;
    };

export type HarnessMessage =
  | { readonly type: 'release'; readonly arrivalID: number }
  | {
      readonly type: 'request';
      readonly requestID: number;
      readonly operation: string;
      readonly args: unknown;
    };
