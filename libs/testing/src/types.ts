// A lib cannot import a module, so this type mirrors the fault point context of modules/tasks.
export interface FaultPointWork {
  readonly kind: string;
  readonly id: string | null;
}

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
