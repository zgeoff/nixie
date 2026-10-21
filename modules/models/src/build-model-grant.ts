import type { GrantSpec, SecretSpec } from '@heynixie/sandbox';

const nixieBrokerPlaceholder = 'nixie-broker-placeholder';

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
