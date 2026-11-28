import { buildGeminiImages, geminiImagesAPI } from '@heynixie/image-gemini';
import { buildOpenAIImages, openAIImagesAPI } from '@heynixie/image-openai';

// The image providers of this nixie, by the ID a profile's `provider` names: the API its adapter
// fixes, the base URL its calls go to and where the key goes, and the adapter's builder. The
// credential may reach only the URL's origin.
export const imageProviderAPI = {
  openai: { ...openAIImagesAPI, build: buildOpenAIImages },
  gemini: { ...geminiImagesAPI, build: buildGeminiImages },
} as const;

export type ImageProviderID = keyof typeof imageProviderAPI;

export function isImageProviderID(id: string): id is ImageProviderID {
  return Object.hasOwn(imageProviderAPI, id);
}
