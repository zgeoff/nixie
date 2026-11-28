import type { ImageProvider } from '@heynixie/connectors';
import invariant from 'tiny-invariant';
import type { ImageSettings } from '../server/create-image-settings';
import { imageProviderAPI, isImageProviderID } from './image-provider-api';

// One provider for each profile, on the API of the profile's provider and with its own fetcher.
export function buildImageProviders(settings: ImageSettings): Record<string, ImageProvider> {
  const providers: Record<string, ImageProvider> = {};

  for (const [key, profile] of Object.entries(settings.config.profiles)) {
    const fetcher = settings.fetches[key];

    invariant(fetcher, 'every profile has a fetcher after the start checks');
    invariant(isImageProviderID(profile.provider), 'the config load refuses an unknown provider');

    const api = imageProviderAPI[profile.provider];

    providers[key] = api.build({ fetch: fetcher, apiURL: api.url });
  }

  return providers;
}
