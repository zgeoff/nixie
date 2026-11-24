import type { ResolveCredential } from '@heynixie/credentials';
import type { ModelsConfig, ResolvedProfile } from '../types';

export function resolveModelCredentials(
  config: ModelsConfig,
  resolveCredential: ResolveCredential,
): Readonly<Record<string, ResolvedProfile>> {
  return Object.fromEntries(
    Object.values(config.profiles).map((profile) => [
      profile.id,
      {
        profile,
        credential: resolveCredential({ class: 'model', reference: profile.credential }),
      },
    ]),
  );
}
