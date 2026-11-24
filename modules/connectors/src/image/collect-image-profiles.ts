import type { ImagesConfig } from './images-config-schema';

// The configured profiles with their models, without `excluded` when given.
export function collectImageProfiles(
  images: Pick<ImagesConfig, 'profiles'>,
  excluded?: string,
): { profile: string; model: string }[] {
  return Object.entries(images.profiles)
    .filter(([key]) => key !== excluded)
    .map(([key, profile]) => ({ profile: key, model: profile.model }));
}
