import type { ModelPrices } from '@heynixie/models';

export interface ProxyRoute {
  readonly upstream: string;
  readonly model: string;
  readonly prices: ModelPrices;
}

export interface ProxyLimits {
  readonly dollars: number | null;
  readonly tokens: number | null;
}

export interface ProxyConfig {
  readonly listen: { readonly hostname: string; readonly port: number };
  readonly store: string;
  readonly limits: ProxyLimits;
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
