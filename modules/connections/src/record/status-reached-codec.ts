import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import type { ConnectionRecordKind } from './connection-record-kind';

const kind = 'connection.status_reached' satisfies ConnectionRecordKind;

// The clock took a connection into `expiring`, or past the end of its grant into `needs_consent`.
// Neither change is a write of the credential store, so the watch records each once. `endsAtMs` is
// the end of the grant that the status counts from.
export const statusReachedCodec = defineRecordCodec(
  kind,
  z.object({
    connection: z.string(),
    status: z.enum(['expiring', 'needs_consent']),
    endsAtMs: z.number(),
  }),
);
