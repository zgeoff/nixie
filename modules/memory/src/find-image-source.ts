import { z } from 'zod';
import type { ImageRef } from './gate-types';

const imageChecks = z.object({
  image: z.object({
    messageSequence: z.int().positive(),
    image: z.int().positive(),
  }),
});

export function findImageSource(checks: unknown): ImageRef | null {
  const parsed = imageChecks.safeParse(checks);

  return parsed.success ? parsed.data.image : null;
}
