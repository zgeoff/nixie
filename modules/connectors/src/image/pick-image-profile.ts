import type { ImageProvider } from '../types';
import type { ImageProfile } from './images-config-schema';
import type { ImageToolOptions } from './types';

export interface PickedProfile {
  readonly key: string;
  readonly profile: ImageProfile;
  readonly provider: ImageProvider;
}

// The profile a call names, or the default when it names none. Null when no such profile exists.
export function pickImageProfile(
  options: Pick<ImageToolOptions, 'images' | 'providers'>,
  key: string | undefined,
): PickedProfile | null {
  const picked = key ?? options.images.default;

  const profile = Object.hasOwn(options.images.profiles, picked)
    ? options.images.profiles[picked]
    : undefined;

  const provider = Object.hasOwn(options.providers, picked) ? options.providers[picked] : undefined;

  return profile === undefined || provider === undefined
    ? null
    : { key: picked, profile, provider };
}
