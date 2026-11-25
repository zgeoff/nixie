import type { ImageProvider } from '@heynixie/connectors';
import { buildGeminiImages } from '@heynixie/image-gemini';
import { buildOpenAIImages } from '@heynixie/image-openai';
import invariant from 'tiny-invariant';
import type { ImageSettings } from '../server/create-image-settings';
import { imageProviderAPI } from './image-provider-api';

// One provider for each profile, on the API of the profile's provider and with its own fetcher.
export function buildImageProviders(settings: ImageSettings): Record<string, ImageProvider> {
  const providers: Record<string, ImageProvider> = {};

  for (const [key, profile] of Object.entries(settings.config.profiles)) {
    const fetcher = settings.fetches[key];

    invariant(fetcher, 'every profile has a fetcher after the start checks');

    providers[key] =
      profile.provider === 'openai'
        ? buildOpenAIImages({ fetch: fetcher, apiURL: imageProviderAPI.openai.url })
        : buildGeminiImages({ fetch: fetcher, apiURL: imageProviderAPI.gemini.url });
  }

  return providers;
}
