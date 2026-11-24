import type { DirectResult } from '@heynixie/tools';
import { collectImageProfiles } from './collect-image-profiles';
import type { ImagesConfig } from './images-config-schema';

// A refusal with every configured profile and its model, so the model can pick one to retry on.
export function buildListedRefusal(images: ImagesConfig, refusal: DirectResult): DirectResult {
  return { ...refusal, result: { ...refusal.result, profiles: collectImageProfiles(images) } };
}
