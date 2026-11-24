import type { Clock } from '@heynixie/clock';
import type { CheckedTables } from '@heynixie/db';
import type { Definitions, Log } from '@heynixie/log';

export type PeriodName = 'day' | 'month';

export type SpendMeasure = 'dollars' | 'tokens' | 'turns';

export interface SpendTriple {
  readonly dollars: number;
  readonly tokens: number;
  readonly turns: number;
}

// The limits that nixie holds itself, as the models config sets them. The gateway holds the
// dollars and the tokens, and nixie counts the turns.
export interface SpendTurnLimits {
  readonly dayTurns: number;
  readonly dayTurnCap: number;
  readonly monthTurns: number;
}

export interface SpendContext {
  readonly gateway: SpendGateway;
  readonly log: Log;
  readonly clock: Clock;

  // the zone in which the day and the month start, the time tool's default zone
  readonly zone: string;
  readonly limits: SpendTurnLimits;
  readonly definitions: () => Definitions;

  // the last answer of the gateway's plan logins, which a step on a plan profile reads
  readonly planLogins: PlanLoginsHolder;
}

// What the stop is now. A trip also holds the measures of its period, so a client can offer a
// raise: `limits` are the limits in force, `used` the counts, and `cap` the highest a raise reaches.
export type SpendStop =
  | { readonly state: 'clear' }
  | { readonly state: 'unreachable' }
  | { readonly state: 'lost' }
  | {
      readonly state: 'tripped';
      readonly period: PeriodName;

      // the ISO date of the period's first day, which a raise names
      readonly start: string;
      readonly measure: SpendMeasure;
      readonly limit: number;
      readonly spent: number;
      readonly at: number;
      readonly resetsAt: number;
      readonly canRaise: boolean;
      readonly limits: SpendTriple;
      readonly used: SpendTriple;
      readonly cap: SpendTriple;
    };

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

// The state of one plan route's login, as the gateway reports it. It holds no token and no email.
export interface PlanLoginStatus {
  readonly status: 'active' | 'failing' | 'needs_login';
  readonly accountID: string | null;
  readonly planType: string | null;
}

// The route ID of each plan route with its login, or the mark that the last read got no answer.
export type PlanLogins =
  | { readonly state: 'read'; readonly routes: Readonly<Record<string, PlanLoginStatus>> }
  | { readonly state: 'unreachable' };

// The last answer, which lives in memory only: it holds no token and no email, and it is never
// written to the database.
export interface PlanLoginsHolder {
  readonly read: () => PlanLogins;
  readonly write: (logins: PlanLogins) => void;
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

  // the login of each plan route, by route ID
  readonly readChatGPTLogins: () => Promise<
    Done<Readonly<Record<string, PlanLoginStatus>>> | Unreachable
  >;
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

interface SpendRaiseTable {
  readonly start: string;
  readonly dollars: number;
  readonly tokens: number;
  readonly turns: number;
  readonly raised_by: string;
  readonly at: number;
  readonly updated_sequence: number;
}

interface SpendTurnTable {
  readonly bucket_start: number;
  readonly turns: number;
}

interface SpendTurnsFoldedTable {
  readonly id: number;
  readonly through_sequence: number;
}

export type SpendTables = CheckedTables<
  Readonly<{
    spend_raises: SpendRaiseTable;
    spend_turns: SpendTurnTable;
    spend_turns_folded: SpendTurnsFoldedTable;
  }>
>;
