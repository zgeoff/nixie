import type { ModelSecrets, ModelsConfig, ResolvedProfile } from './types';

// Resolves every profile's credential from nixie's decrypted secrets: deployment:<name> names the
// entry <name> under model_credentials. It refuses a reference whose entry is missing, so nixie
// stops at start rather than at its first turn.
export function resolveModelCredentials(
  config: ModelsConfig,
  secrets: ModelSecrets,
): Readonly<Record<string, ResolvedProfile>> {
  return Object.fromEntries(
    Object.values(config.profiles).map((profile) => {
      const name = profile.credential.slice('deployment:'.length);
      const credential = secrets.model_credentials?.[name];

      if (credential === undefined || credential === '') {
        throw new Error(
          `the profile ${profile.id} names the credential ${profile.credential}, and the secrets file has no model_credentials entry ${name}`,
        );
      }

      return [profile.id, { profile, credential }];
    }),
  );
}
