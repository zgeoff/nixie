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

export interface CounterStore {
  readonly read: () => Promise<SpendTotals>;
  readonly add: (spend: SpendTotals) => Promise<SpendTotals>;

  // resolves once every add made so far has written or failed
  readonly settle: () => Promise<void>;
}
