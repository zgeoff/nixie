import { sandboxImageKeys } from '@heynixie/sandbox';
import { z } from 'zod';
import { buildImageShape } from './build-image-shape';

// The images that release.json names, each as <repository>:<version>@sha256:<digest>, which the
// release rehearsal resolves against its registry.
export const releaseImagesSchema = z.object({
  images: z.strictObject({ server: z.string(), web: z.string(), backup: z.string() }),
  sandboxImages: buildImageShape(sandboxImageKeys, z.string(), 'required'),
});
