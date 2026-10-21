import type { ModelSecrets, ModelsConfig, ResolvedProfile } from './types';

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
