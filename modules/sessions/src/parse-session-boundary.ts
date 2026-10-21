import type { SessionPoint } from '@heynixie/wire';
import { z } from 'zod';

const sessionPointSchema = z.object({ sessionID: z.uuid(), messageID: z.uuid() });

export function parseSessionBoundary(boundary: string | null): SessionPoint | null {
  if (boundary === null) {
    return null;
  }

  try {
    return sessionPointSchema.parse(JSON.parse(boundary));
  } catch {
    return null;
  }
}
