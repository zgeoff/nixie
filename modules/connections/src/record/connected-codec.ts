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

  // for a renewal: whether the connection was in a status the model hears of, such as `expiring`,
  // when it was renewed
  wasAttending: z.boolean().exactOptional(),

  // for a renewal: the end of the grant it gave, and of the grant it replaced, each null for a grant
  // of no limited time. A renewal before they were kept holds neither.
  endsAtMs: z.number().nullable().exactOptional(),
  endedAtMs: z.number().nullable().exactOptional(),
});

// A consent finished. `again` is true when it renewed a connection that already existed. It holds no
// label, address or account ID, so the connection's keys cover every copy that nixie keeps.
export const connectedCodec = defineRecordCodec(kind, payloadSchema);
