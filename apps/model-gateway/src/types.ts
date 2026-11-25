import type { ModelPrices } from '@heynixie/models/prices';
import type { ModelAPI } from '@heynixie/wire';

// the files of a plan route, whose requests the gateway signs with a ChatGPT plan login
export interface PlanLoginConfig {
  readonly file: string;
  readonly routeKeyFile: string;
}

export interface ProxyRoute {
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

export type PeriodName = 'day' | 'month';

export interface PeriodsConfig {
  // an IANA zone, the one the day and the month reset in
  readonly zone: string;

  // the most each period's limit reaches without the host command
  readonly caps: Readonly<Record<PeriodName, Measures>>;
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

  // exactly one of limits and periods is set
  readonly limits: ProxyLimits | null;
  readonly periods: PeriodsConfig | null;
  readonly capture: CaptureConfig | null;
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

export interface PeriodCount extends Measures {
  // the ISO date of the period's first day, in the periods zone
  readonly start: string;

  // the ISO instant the period ends and its count resets. Stamped with the zone the period began
  // in, so a changed zone takes effect at the next reset. Null in a store from before the stamp,
  // which ends the period at the next start in the current zone.
  readonly resetsAt: string | null;

  // the base limit the server set, null until it sets one
  readonly limit: Measures | null;

  // the day's raise, always null on the month
  readonly raise: Measures | null;

  // the ISO instant the count first reached its limit in force, null while it is under it
  readonly trippedAt: string | null;
}

interface SandboxCount extends Measures {
  // null counts only
  readonly limit: Measures | null;
}

export interface PeriodStore {
  readonly version: 2;
  readonly lost: boolean;
  readonly periods: Readonly<Record<PeriodName, PeriodCount>>;
  readonly sandboxes: Readonly<Record<string, SandboxCount>>;
}

// the host command writes it, and it may pass the cap
export interface Override {
  readonly period: PeriodName;
  readonly start: string;
  readonly limit: Measures;
}

export interface PeriodChange<T> {
  // null writes nothing, for a refused change
  readonly store: PeriodStore | null;
  readonly result: T;
}

// the store and the override that one read found, so a caller judges both as of the same moment
export interface PeriodRead {
  readonly store: PeriodStore;
  readonly override: Override | null;
}

export interface PeriodStoreHandle {
  // the store after each period that ended has reset
  readonly read: () => Promise<PeriodStore>;
  readonly readInForce: () => Promise<PeriodRead>;

  // reads, resets, decides and writes in one turn
  readonly change: <T>(decide: (store: PeriodStore) => PeriodChange<T>) => Promise<T>;

  // adds the spend to the day, the month and the sandbox in one write; a sandbox the store lacks,
  // or null, counts on the periods only
  readonly addSpend: (sandbox: string | null, spend: Measures) => Promise<PeriodRead>;
  readonly markLost: () => Promise<void>;

  // resolves once every change made so far has written or failed
  readonly settle: () => Promise<void>;
}
