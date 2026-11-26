import type { ModelPrices } from '@heynixie/models/prices';
import type { ModelAPI } from '@heynixie/wire';

// the files of a plan route, whose requests the gateway signs with a ChatGPT plan login
export interface PlanLoginConfig {
  readonly file: string;
  readonly routeKeyFile: string;
}

export interface ProxyRoute {
  // a key of the config's providers, whose limits bind this route beside its own
  readonly provider: string;
  readonly api: ModelAPI;
  readonly upstream: string;
  readonly model: string;

  // the provider an OpenRouter route pins, which the only provider field a request may hold names
  readonly providerPin: string | null;
  readonly prices: ModelPrices;

  // the model's largest output, which bounds a reply whose request sets no output limit
  readonly maxOutputTokens: number | null;

  // null on a route that holds no plan login
  readonly login: PlanLoginConfig | null;

  // the day and month limits in US dollars, null on a route with none, which its provider limits
  // alone
  readonly limits: RouteLimits | null;
}

// A provider is one place the model requests go. Its limits are required and bind every route of it.
export interface ProxyProvider {
  readonly limits: RouteLimits;
}

export interface RouteLimits {
  readonly day: number;
  readonly month: number;

  // the most a raise of the day reaches without the host command
  readonly dayCap: number;
}

export interface ProxyLimits {
  readonly dollars: number | null;
  readonly tokens: number | null;
}

export interface CaptureConfig {
  readonly spool: string;
  readonly maxBytes: number;
  readonly maxPending: number;
}

export interface Measures {
  readonly dollars: number;
  readonly tokens: number;
}

// A sandbox's own limit. A limit with no tokens sets no token limit.
export interface SandboxLimit {
  readonly dollars: number;
  readonly tokens?: number;
}

export type PeriodName = 'day' | 'month';

export interface PeriodsConfig {
  // an IANA zone, the one the day and the month reset in
  readonly zone: string;

  readonly control: {
    readonly listen: { readonly hostname: string; readonly port: number };
    readonly tokenFile: string;
  };
  readonly countBySandbox: boolean;

  // null when the config names no override file
  readonly override: string | null;
}

export interface ProxyConfig {
  readonly listen: { readonly hostname: string; readonly port: number };
  readonly store: string;

  readonly periods: PeriodsConfig;
  readonly capture: CaptureConfig | null;
  readonly providers: Readonly<Record<string, ProxyProvider>>;
  readonly routes: Readonly<Record<string, ProxyRoute>>;
}

export interface SpendTotals {
  readonly dollars: number;
  readonly tokens: number;
}

// lost marks a count that fell behind the spend, which stays marked until an operator clears it
export interface StoredCount extends SpendTotals {
  readonly lost: boolean;
}

export interface CounterStore {
  readonly read: () => Promise<StoredCount>;
  readonly add: (spend: SpendTotals) => Promise<SpendTotals>;
  readonly markLost: () => Promise<void>;

  // resolves once every add made so far has written or failed
  readonly settle: () => Promise<void>;
}

// One route's count of one period, in whole micros of a US dollar
export interface RouteCount {
  // the ISO date of the period's first day, in the periods zone
  readonly start: string;

  // the ISO instant the period ends and its count resets. Stamped with the zone the period began
  // in, so a changed zone takes effect at the next reset.
  readonly resetsAt: string;
  readonly micros: number;

  // the day's raise of the limit, always null on the month
  readonly raise: number | null;

  // the ISO instant the count first reached its limit in force, null while it is under it
  readonly trippedAt: string | null;
}

export interface RoutePeriods {
  readonly day: RouteCount;
  readonly month: RouteCount;
}

export type RefusalCounter =
  | 'route_day'
  | 'route_month'
  | 'provider_day'
  | 'provider_month'
  | 'sandbox';

// the last request a sandbox's count refused
export interface Refusal {
  readonly counter: RefusalCounter;
  readonly route: string;
  readonly provider: string;
  readonly atMs: number;
}

interface SandboxCount {
  // whole micros of a US dollar
  readonly micros: number;
  readonly tokens: number;

  // null counts only
  readonly limit: SandboxLimit | null;
  readonly lastRefusal: Refusal | null;

  // goes up by one at each write of the limit, so a conditional patch can tell a newer write
  readonly limitRevision: number;
}

export interface PeriodStore {
  readonly version: 4;
  readonly lost: boolean;

  // each provider's day and month, summed from the replies of its routes
  readonly providers: Readonly<Record<string, RoutePeriods>>;
  readonly routes: Readonly<Record<string, RoutePeriods>>;
  readonly sandboxes: Readonly<Record<string, SandboxCount>>;

  // the highest limit revision that any sandbox took, kept after its sandbox goes, so a name that
  // registers again never takes a revision that a late patch could name
  readonly lastLimitRevision?: number;
}

// A day limit, which the host command writes and which may pass the cap
export interface DayOverride {
  readonly start: string;
  readonly dollars: number;
}

// the day limit of each route and of each provider, by ID, so a route and a provider may share one
export interface Overrides {
  readonly routes: Readonly<Record<string, DayOverride>>;
  readonly providers: Readonly<Record<string, DayOverride>>;
}

export interface PeriodChange<T> {
  // null writes nothing, for a refused change
  readonly store: PeriodStore | null;
  readonly result: T;
}

// the store and the overrides that one read found, so a caller judges both as of the same moment
export interface PeriodRead {
  readonly store: PeriodStore;
  readonly overrides: Overrides;
}

// the route a reply came from and the provider of that route
export interface SpendTarget {
  readonly route: string;
  readonly provider: string;
}

export interface PeriodStoreHandle {
  // the store after each period that ended has reset
  readonly read: () => Promise<PeriodStore>;
  readonly readInForce: () => Promise<PeriodRead>;

  // reads, resets, decides and writes in one turn
  readonly change: <T>(decide: (store: PeriodStore) => PeriodChange<T>) => Promise<T>;

  // adds the spend's dollars, in whole micros, to the route's and the provider's day and month, and
  // the spend to the sandbox, in one write; a sandbox the store lacks, or null, counts on the route
  // and the provider only
  readonly addSpend: (
    target: SpendTarget,
    sandbox: string | null,
    spend: Measures,
  ) => Promise<PeriodRead>;

  // writes the refusal on the sandbox's count; a sandbox the store lacks keeps none
  readonly writeRefusal: (sandbox: string, refusal: Refusal) => Promise<void>;
  readonly markLost: () => Promise<void>;

  // resolves once every change made so far has written or failed
  readonly settle: () => Promise<void>;
}
