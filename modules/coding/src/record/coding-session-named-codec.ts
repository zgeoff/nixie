import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// The short ID that a session got, so it keeps the ID across listings. The adapter's session ID
// is an opaque ID and never text of a person's.
export const codingSessionNamedCodec = defineRecordCodec(
  'coding.session_named',
  z.object({ adapter: z.string(), sessionID: z.string(), shortID: z.string() }),
);
