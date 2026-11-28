import type { ImagesConfig, ProviderFetch } from '@heynixie/connectors';
import type { CredentialAccess } from '@heynixie/credentials';
import invariant from 'tiny-invariant';
import { imageProviderAPI, isImageProviderID } from '../part/image-provider-api';

export interface ImageSettings {
  readonly config: ImagesConfig;

  // the fetcher of each profile, by the profile's key, which adds the profile's key on the host
  readonly fetches: Readonly<Record<string, ProviderFetch>>;
}

export function createImageSettings(
  config: ImagesConfig | null,
  credentials: CredentialAccess,
): ImageSettings | null {
  if (config === null) {
    return null;
  }

  const fetches: Record<string, ProviderFetch> = {};

  for (const [key, profile] of Object.entries(config.profiles)) {
    const ref = credentials.resolveCredential({
      class: 'connector',
      reference: profile.credential,
      configKey: `images.profiles.${key}.credential`,
    });

    invariant(ref !== null, 'the resolver stops at a missing connector entry');
    invariant(isImageProviderID(profile.provider), 'the config load refuses an unknown provider');

    const api = imageProviderAPI[profile.provider];

    const origin = new URL(api.url).origin;

    const binding = credentials.store.register(ref, {
      kind: 'static',
      label: `${profile.provider} images`,
      origins: [origin],
      ...(api.placement === undefined ? {} : { placement: api.placement }),
    });

    fetches[key] = credentials.store.fetcher(binding, [origin]);
  }

  return { config, fetches };
}
