import type { SessionPoint } from '@heynixie/wire';
import { sessionPointSchema } from '@heynixie/wire';

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
