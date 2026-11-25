import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import type { ConnectionRecordKind } from './connection-record-kind';

const kind = 'connection.connected' satisfies ConnectionRecordKind;
const reasonSchema = z.enum(['not_granted', 'api_disabled']);
const missingSchema = z.object({ scope: z.string(), reason: reasonSchema });

const payloadSchema = z.object({
  connection: z.string(),
  shortID: z.string(),
  scopes: z.array(z.string()),
  missing: z.array(missingSchema),
  fingerprint: z.string(),
  again: z.boolean(),
});

// A consent finished. `again` is true when it renewed a connection that already existed. It holds no
// label, address or account ID, so the connection's keys cover every copy that nixie keeps.
export const connectedCodec = defineRecordCodec(kind, payloadSchema);
