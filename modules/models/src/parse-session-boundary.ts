import type { SessionPoint } from '@heynixie/wire';
import { z } from 'zod';

const sessionPointSchema = z.object({ sessionID: z.uuid(), messageID: z.uuid() });

// Parses the session boundary a step commit recorded, which encodes a session point as JSON. A
// boundary nixie cannot read starts a fresh session, because the event log, not the SDK
// transcript, is the record.
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
