import type { SandboxImage } from '@heynixie/sandbox';
import { z } from 'zod';

const sandboxImageSchema = z.strictObject({
  name: z.string(),
  ref: z.string(),
}) satisfies z.ZodType<SandboxImage>;

// What `nixie sandbox-manifest` prints, which a deployment's scripts and the image checks read.
export const sandboxImagesSchema = z.strictObject({
  conversation: sandboxImageSchema,
  fetch: sandboxImageSchema,
});
