import type { ModelSecrets, ModelsConfig, ResolvedProfile } from './types';

export function resolveModelCredentials(
  config: ModelsConfig,
  secrets: ModelSecrets,
): Readonly<Record<string, ResolvedProfile>> {
  return Object.fromEntries(
    Object.values(config.profiles).map((profile) => {
      const name = profile.credential.slice('deployment:'.length);

      return [profile.id, { profile, credential: secrets.model_credentials?.[name] ?? null }];
    }),
  );
}
