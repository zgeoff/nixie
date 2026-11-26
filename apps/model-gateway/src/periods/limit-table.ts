import type { ProxyConfig, RouteLimits } from '../types';

// What the gateway limits: each route's own limits where it has any, each provider's limits, and
// the provider each route belongs to
export interface LimitTable {
  readonly routes: Readonly<Record<string, RouteLimits | null>>;
  readonly providers: Readonly<Record<string, RouteLimits>>;
  readonly providerOf: Readonly<Record<string, string>>;
}

export function buildLimitTable(config: ProxyConfig): LimitTable {
  return {
    routes: Object.fromEntries(
      Object.entries(config.routes).map(([id, route]) => [id, route.limits]),
    ),
    providers: Object.fromEntries(
      Object.entries(config.providers).map(([id, provider]) => [id, provider.limits]),
    ),
    providerOf: Object.fromEntries(
      Object.entries(config.routes).map(([id, route]) => [id, route.provider]),
    ),
  };
}
