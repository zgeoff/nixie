import type { ImageProvider, ImagesConfig } from '@heynixie/connectors';
import { buildStubImageProvider } from './build-stub-image-provider';

// One stub for each profile of the images block, in place of the profile's real provider.
export function buildStubImageProviders(config: ImagesConfig): Record<string, ImageProvider> {
  return Object.fromEntries(
    Object.keys(config.profiles).map((key) => [key, buildStubImageProvider()]),
  );
}
