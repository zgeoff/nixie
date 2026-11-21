import type { Definitions, Log } from '@heynixie/log';
import type { ImageProvider } from '../types';
import type { ImagesConfig } from './images-config-schema';

// The wiring every image tool takes.
export interface ImageToolOptions {
  readonly log: Log;
  readonly definitions: () => Definitions;
  readonly clock: { readonly now: () => number };

  // the long side a picture is scaled to for the model, as a fetched image is
  readonly imageLongEdge: number;
  readonly images: ImagesConfig;

  // the provider of each profile, by the profile's key
  readonly providers: Readonly<Record<string, ImageProvider>>;

  // the time a draw may take before it counts as timed out; 120 seconds when absent
  readonly drawTimeoutMs?: number;
}
