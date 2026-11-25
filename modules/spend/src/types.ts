import type { Clock } from '@heynixie/clock';
import type { CheckedTables } from '@heynixie/db';
import type { Definitions, Log } from '@heynixie/log';

export type PeriodName = 'day' | 'month';

export type SpendMeasure = 'turns';

// The limits that nixie holds itself, as the models config sets them. The gateway holds each
// route's dollars, and nixie counts the turns.
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

  // the currency that the client shows beside each dollar figure, absent when the config sets none
  readonly display?: DisplayRates;
}

// The rate of one US dollar in another currency, from the outside
export interface RateSource {
  // null when the source gives no rate for the currency
  readonly readRate: (currency: string) => Promise<number | null>;
}

// The last rate that the source gave, which the client shows beside each US dollar figure
export interface DisplayRates {
  readonly currency: string;

  // the rate now, or null while no read has given one
  readonly readRate: () => Promise<number | null>;
}

// What the stop is now, for the whole of nixie: the gateway does not answer, it lost its count, or
// the turn count reached a limit. A route that reached its dollar limit holds only its own work, so
// it is a RouteTrip and never a state of this stop.
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

      // the most a raise reaches
      readonly cap: number;
    };

// A route that reached its day or month limit in US dollars. Only the work on the route waits.
export interface RouteTrip {
  readonly route: string;
  readonly period: PeriodName;

  // the ISO date of the period's first day, which a raise names
  readonly start: string;
  readonly limit: number;
  readonly spent: number;
  readonly at: number;
  readonly resetsAt: number;
  readonly canRaise: boolean;

  // the most a raise of the day reaches, null on the month
  readonly cap: number | null;
}

export interface Measures {
  readonly dollars: number;
  readonly tokens: number;
}

export interface RoutePeriodStatus {
  // the ISO date of the period's first day, in the gateway's zone
  readonly start: string;
  readonly resetsAt: string;
  readonly dollars: number;

  // the limit in force in US dollars, null on a route with none
  readonly limit: number | null;

  // the most a raise of the day reaches, null on the month
  readonly cap: number | null;
  readonly tripped: boolean;

  // when the count first reached the limit, null while it is under
  readonly sinceMs: number | null;
}

export interface RouteStatus {
  readonly day: RoutePeriodStatus;
  readonly month: RoutePeriodStatus;
}

export interface GatewayStatus {
  readonly zone: string;
  readonly lost: boolean;
  readonly routes: Readonly<Record<string, RouteStatus>>;
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

export type RefusalCounter = 'route_day' | 'route_month' | 'sandbox';

// The last request that a sandbox's count refused
export interface SandboxRefusal {
  readonly counter: RefusalCounter;
  readonly route: string;
  readonly atMs: number;
}

export interface SandboxCount {
  readonly dollars: number;
  readonly tokens: number;
  readonly tripped: boolean;
  readonly lastRefusal: SandboxRefusal | null;
}

export interface SandboxLimit {
  readonly dollars: number;
  readonly tokens?: number | undefined;
}

export interface GatewayRaise {
  readonly route: string;
  readonly start: string;
  readonly dollars: number;
}

// A call that the gateway did not answer, or answered in a way the port does not know, such as a 401
// or a 503 or a reply that is not its own. The reason names it for the log.
export interface Unreachable {
  readonly kind: 'unreachable';
  readonly reason: string;
}

export interface AboveCap {
  readonly kind: 'above_cap';
  readonly route: string;
  readonly cap: number;
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
  readonly postRaise: (
    raise: GatewayRaise,
  ) => Promise<Done<GatewayStatus> | AboveCap | PeriodEnded | Unreachable>;

  // sets the sandbox's limit, or null to count only, and sets its count to zero
  readonly putSandbox: (name: string, limit: Measures | null) => Promise<Done | Unreachable>;

  // sets the limit whole and keeps the count; a name the gateway lacks is not_found
  readonly patchSandbox: (
    name: string,
    limit: SandboxLimit | null,
  ) => Promise<Done | NotFound | Unreachable>;
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

interface SpendRouteRaiseTable {
  readonly route_id: string;
  readonly start: string;
  readonly dollars: number;
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
    spend_route_raises: SpendRouteRaiseTable;
    spend_turns: SpendTurnTable;
    spend_turns_folded: SpendTurnsFoldedTable;
  }>
>;
