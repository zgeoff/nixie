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

// A provider that reached its day or month limit in US dollars. The work on every route of the
// provider waits.
export interface ProviderTrip {
  readonly provider: string;

  // the provider's routes in the gateway's status, which the stop holds
  readonly routes: readonly string[];
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

export interface ProviderStatus {
  readonly day: RoutePeriodStatus;
  readonly month: RoutePeriodStatus;
}

export interface RouteStatus {
  // the provider whose limits bind the route, empty from a gateway that names none
  readonly provider: string;
  readonly day: RoutePeriodStatus;
  readonly month: RoutePeriodStatus;
}

export interface GatewayStatus {
  readonly zone: string;
  readonly lost: boolean;

  // none from a gateway that holds no provider
  readonly providers: Readonly<Record<string, ProviderStatus>>;
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

export type RefusalCounter =
  | 'route_day'
  | 'route_month'
  | 'provider_day'
  | 'provider_month'
  | 'sandbox';

// The last request that a sandbox's count refused
export interface SandboxRefusal {
  readonly counter: RefusalCounter;
  readonly route: string;

  // the route's provider, empty on a refusal that an older gateway stored
  readonly provider: string;
  readonly atMs: number;
}

export interface SandboxCount {
  readonly dollars: number;
  readonly tokens: number;
  readonly tripped: boolean;
  readonly lastRefusal: SandboxRefusal | null;

  // goes up by one at each write of the sandbox's limit
  readonly limitRevision: number;
}

// A sandbox's own limit in the gateway. A limit with no tokens sets no token limit.
export interface SandboxLimit {
  readonly dollars: number;
  readonly tokens?: number;
}

// The one route or provider that a raise or a count change names
export type LimitTarget =
  | { readonly kind: 'route'; readonly id: string }
  | { readonly kind: 'provider'; readonly id: string };

export interface GatewayRaise {
  readonly target: LimitTarget;
  readonly start: string;
  readonly dollars: number;
}

// One period's count, set to the dollars given
export interface GatewayCountSet {
  readonly target: LimitTarget;
  readonly period: PeriodName;
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
  readonly route: string | null;
  readonly provider: string | null;
  readonly cap: number;
}

// A raise named a route that has no limit of its own, which its provider's limits bind
export interface NoRouteLimit {
  readonly kind: 'no_route_limit';
  readonly route: string;
}

export interface PeriodEnded {
  readonly kind: 'period_ended';
}

export interface NotFound {
  readonly kind: 'not_found';
}

// A write of the sandbox's limit landed after the read that a conditional patch named
export interface RevisionChanged {
  readonly kind: 'revision_changed';
}

export interface CountReplaced {
  readonly replacedDollars: number;
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
  ) => Promise<Done | AboveCap | NoRouteLimit | NotFound | PeriodEnded | Unreachable>;

  // sets one period's count of a route or a provider, and changes no limit. It answers the dollars
  // the period held when the gateway replaced them.
  readonly postCount: (
    change: GatewayCountSet,
  ) => Promise<Done<CountReplaced> | NotFound | PeriodEnded | Unreachable>;

  // sets the sandbox's limit, or null to count only, and sets its count to zero
  readonly putSandbox: (name: string, limit: Measures | null) => Promise<Done | Unreachable>;

  // sets the sandbox's limit whole, or null to count only, and keeps its count. With a revision,
  // the gateway sets it only while the limit's revision is still that one.
  readonly patchSandbox: (
    name: string,
    limit: SandboxLimit | null,
    revision?: number,
  ) => Promise<Done | NotFound | RevisionChanged | Unreachable>;

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

interface SpendProviderRaiseTable {
  readonly provider_id: string;
  readonly start: string;
  readonly dollars: number;
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
    spend_provider_raises: SpendProviderRaiseTable;
    spend_turns: SpendTurnTable;
    spend_turns_folded: SpendTurnsFoldedTable;
  }>
>;
