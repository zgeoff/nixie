import type { ImagesConfig } from './images-config-schema';

// The configured profiles with their models.
export function collectImageProfiles(
  images: Pick<ImagesConfig, 'profiles'>,
): { profile: string; model: string }[] {
  return Object.entries(images.profiles).map(([key, profile]) => ({
    profile: key,
    model: profile.model,
  }));
}
