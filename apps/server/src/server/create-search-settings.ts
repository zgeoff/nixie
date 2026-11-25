import type { ProviderFetch, SearchConfig } from '@heynixie/connectors';
import type { CredentialAccess } from '@heynixie/credentials';
import invariant from 'tiny-invariant';

export interface SearchSettings {
  // adds the API key on the host
  readonly fetch: ProviderFetch;
  readonly apiURL: string;
  readonly dailyCallCap: number;
  readonly priceMicros: number;
}

export function createSearchSettings(
  config: SearchConfig,
  credentials: CredentialAccess,
): SearchSettings | null {
  if (config.credential === null) {
    return null;
  }

  const ref = credentials.resolveCredential({
    class: 'connector',
    reference: config.credential,
    configKey: 'search.credential',
  });

  invariant(ref !== null, 'the resolver stops at a missing connector entry');

  const origin = new URL(config.api_url).origin;

  const binding = credentials.store.register(ref, {
    kind: 'static',
    label: 'Kagi',
    origins: [origin],
  });

  return {
    fetch: credentials.store.fetcher(binding, [origin]),
    apiURL: config.api_url,
    dailyCallCap: config.daily_call_cap,
    priceMicros: config.price_micros,
  };
}
