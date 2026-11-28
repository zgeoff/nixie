import type { ProviderFetch, SearchConfig } from '@heynixie/connectors';
import type { CredentialAccess } from '@heynixie/credentials';
import { kagiSearchAPI } from '@heynixie/search-kagi';
import invariant from 'tiny-invariant';

export interface SearchSettings {
  // adds the API key on the host
  readonly fetch: ProviderFetch;
  readonly apiURL: string;
  readonly dailyCallCap: number;
  readonly priceMicros: number;
}

// The search settings, or null when the config has no search section, which turns search off.
export function createSearchSettings(
  config: SearchConfig | undefined,
  credentials: CredentialAccess,
): SearchSettings | null {
  if (config === undefined) {
    return null;
  }

  const ref = credentials.resolveCredential({
    class: 'connector',
    reference: config.credential,
    configKey: 'search.credential',
  });

  invariant(ref !== null, 'the resolver stops at a missing connector entry');

  const apiURL = config.api_url ?? kagiSearchAPI.url;

  const origin = new URL(apiURL).origin;

  const binding = credentials.store.register(ref, {
    kind: 'static',
    label: kagiSearchAPI.label,
    origins: [origin],
  });

  return {
    fetch: credentials.store.fetcher(binding, [origin]),
    apiURL,
    dailyCallCap: config.daily_call_cap,
    priceMicros: config.price_micros ?? kagiSearchAPI.priceMicros,
  };
}
