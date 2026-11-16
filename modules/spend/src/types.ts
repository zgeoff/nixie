export type PeriodName = 'day' | 'month';

export interface Measures {
  readonly dollars: number;
  readonly tokens: number;
}

export interface PeriodStatus {
  // the ISO date of the period's first day, in the gateway's zone
  readonly start: string;
  readonly resetsAt: string;
  readonly spent: Measures;

  // the limit in force, null until the server sets one
  readonly limit: Measures | null;
  readonly cap: Measures;
}

export type GatewayTrip =
  | {
      readonly period: PeriodName;
      readonly measure: 'dollars' | 'tokens';
      readonly at: string;
    }
  | { readonly lost: true; readonly at: string };

export interface GatewayStatus {
  readonly zone: string;
  readonly lost: boolean;
  readonly periods: Readonly<Record<PeriodName, PeriodStatus>>;
  readonly tripped: GatewayTrip | null;
}

export interface SandboxCount {
  readonly dollars: number;
  readonly tokens: number;
  readonly tripped: boolean;
}

export interface GatewayLimits {
  readonly day: Measures;
  readonly month: Measures;
}

export interface GatewayRaise {
  readonly start: string;
  readonly limit: Measures;
}

// A call that the gateway did not answer, or answered in a way the port does not know, such as a 401
// or a 503 or a reply that is not its own. The reason names it for the log.
export interface Unreachable {
  readonly kind: 'unreachable';
  readonly reason: string;
}

export interface AboveCap {
  readonly kind: 'above_cap';
  readonly period: PeriodName | null;
  readonly cap: Measures;
}

export interface PeriodEnded {
  readonly kind: 'period_ended';
}

export interface NotFound {
  readonly kind: 'not_found';
}

export type Done<Value = undefined> = Value extends undefined
  ? { readonly kind: 'ok' }
  : { readonly kind: 'ok'; readonly value: Value };

// Every call to the gateway's control listener goes through this port. Each call returns its
// outcome as a value, and never throws.
export interface SpendGateway {
  readonly readStatus: () => Promise<Done<GatewayStatus> | Unreachable>;
  readonly putLimits: (
    limits: GatewayLimits,
  ) => Promise<Done<GatewayStatus> | AboveCap | Unreachable>;
  readonly postRaise: (
    raise: GatewayRaise,
  ) => Promise<Done<GatewayStatus> | AboveCap | PeriodEnded | Unreachable>;

  // sets the sandbox's limit, or null to count only, and sets its count to zero
  readonly putSandbox: (name: string, limit: Measures | null) => Promise<Done | Unreachable>;
  readonly readSandbox: (name: string) => Promise<Done<SandboxCount> | NotFound | Unreachable>;
  readonly removeSandbox: (name: string) => Promise<Done | Unreachable>;
}
