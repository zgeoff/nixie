import { z } from 'zod';

// The images that release.json names, each as <repository>:<version>@sha256:<digest>, which the
// release rehearsal resolves against its registry.
export const releaseImagesSchema = z.object({
  images: z.strictObject({ server: z.string(), web: z.string() }),
  sandboxImages: z.strictObject({ conversation: z.string(), fetch: z.string() }),
});
