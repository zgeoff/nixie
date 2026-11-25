import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import type { ConnectionRecordKind } from './connection-record-kind';

const kind = 'connection.client_registered' satisfies ConnectionRecordKind;

// An OAuth client was registered. It holds the client's short ID and the keyed fingerprint of its
// secret, never the secret, the client ID or the origin.
export const clientRegisteredCodec = defineRecordCodec(
  kind,
  z.object({ client: z.string(), fingerprint: z.string() }),
);
