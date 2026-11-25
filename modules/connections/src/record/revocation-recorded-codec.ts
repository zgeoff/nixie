import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// The one revocation attempt of a forgotten connection, and how it ended. It holds the connection's
// ID, the HTTP status and an error code from a fixed set, never a token, a label or an address.
export const revocationRecordedCodec = defineRecordCodec(
  'connection.revocation_recorded',
  z.object({
    connection: z.string(),
    outcome: z.enum(['confirmed', 'refused', 'unknown', 'not_attempted']),
    status: z.int().nullable(),
    googleError: z.string().nullable(),
  }),
);
