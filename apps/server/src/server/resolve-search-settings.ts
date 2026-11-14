import type { SearchConfig } from '@heynixie/connectors';

export interface SearchSettings {
  readonly apiKey: string;
  readonly apiURL: string;
  readonly dailyCallCap: number;
}

export function resolveSearchSettings(
  config: SearchConfig,
  credentials: Readonly<Record<string, string>>,
): SearchSettings | null {
  if (config.credential === null) {
    return null;
  }

  const name = config.credential.slice('deployment:'.length);
  const apiKey = Object.hasOwn(credentials, name) ? credentials[name] : undefined;

  if (apiKey === undefined) {
    throw new Error(
      `search.credential is ${config.credential}, and the secrets file has no ` +
        `connector_credentials entry ${name}`,
    );
  }

  return { apiKey, apiURL: config.api_url, dailyCallCap: config.daily_call_cap };
}
