import type { ImageProvider } from '@heynixie/connectors';
import { buildGeminiImages } from '@heynixie/image-gemini';
import { buildOpenAIImages } from '@heynixie/image-openai';
import invariant from 'tiny-invariant';
import type { ImageSettings } from '../server/resolve-image-settings';

const openAIURL = 'https://api.openai.com/v1';
const geminiURL = 'https://generativelanguage.googleapis.com/v1beta';

// One provider for each profile, on the API of the profile's provider and with its own key.
export function buildImageProviders(settings: ImageSettings): Record<string, ImageProvider> {
  const providers: Record<string, ImageProvider> = {};

  for (const [key, profile] of Object.entries(settings.config.profiles)) {
    const apiKey = settings.apiKeys[key];

    invariant(apiKey !== undefined, 'every profile has a key after the start checks');

    providers[key] =
      profile.provider === 'openai'
        ? buildOpenAIImages({ apiKey, apiURL: openAIURL })
        : buildGeminiImages({ apiKey, apiURL: geminiURL });
  }

  return providers;
}
