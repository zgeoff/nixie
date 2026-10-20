import { z } from 'zod';
import type { ImageRef } from './gate-types';

// Finds the photo of yours that a write's checks name as its source, or null for a write from
// anything else.
export function findImageSource(checks: unknown): ImageRef | null {
  const parsed = imageChecks.safeParse(checks);

  return parsed.success ? parsed.data.image : null;
}

const imageChecks = z.object({
  image: z.object({
    messageSequence: z.int().positive(),
    image: z.int().positive(),
  }),
});
