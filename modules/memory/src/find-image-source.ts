import type { JSONObject } from '@heynixie/log';
import { z } from 'zod';
import type { ImageRef } from './gate-types';

const imageCheck = z.object({
  messageSequence: z.int().positive(),
  image: z.int().positive(),
});

// Finds the photo of yours that a write's checks name as its source, or null for a write from
// anything else.
export function findImageSource(checks: JSONObject | null): ImageRef | null {
  const parsed = imageCheck.safeParse(checks?.['image']);

  return parsed.success ? parsed.data : null;
}
