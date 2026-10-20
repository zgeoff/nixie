import type { GrantSpec, SecretSpec } from '@heynixie/sandbox';

// The placeholder the guest holds where the CLI reads its credential; the grant replaces the
// header on every request to the profile's host.
const nixieBrokerPlaceholder = 'nixie-broker-placeholder';

// Builds a model loop's one grant: the profile's secret, limited to its host, with the placeholder
// in the variable the CLI reads for the profile's auth header.
export function buildModelGrant(secret: SecretSpec): GrantSpec {
  return {
    secret: secret.name,
    host: secret.host,
    env:
      secret.header === 'bearer'
        ? { ANTHROPIC_AUTH_TOKEN: nixieBrokerPlaceholder }
        : { ANTHROPIC_API_KEY: nixieBrokerPlaceholder },
  };
}
