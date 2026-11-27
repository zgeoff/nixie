import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import type { ConnectionRecordKind } from './connection-record-kind';

const kind = 'connection.revocation_recorded' satisfies ConnectionRecordKind;

// The one revocation attempt of a forgotten connection, and how it ended. It holds the connection's
// ID, the HTTP status and an error code from a fixed set, never a token, a label or an address.
export const revocationRecordedCodec = defineRecordCodec(
  kind,
  z.object({
    connection: z.string(),
    outcome: z.enum(['confirmed', 'refused', 'unknown', 'not_attempted']),
    status: z.int().nullable(),
    providerError: z.string().nullable().default(null),
  }),
);
