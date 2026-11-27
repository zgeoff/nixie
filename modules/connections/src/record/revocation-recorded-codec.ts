import type { JSONObject } from '@heynixie/log';
import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import type { ConnectionRecordKind } from './connection-record-kind';

const kind = 'connection.revocation_recorded' satisfies ConnectionRecordKind;

// The one revocation attempt of a forgotten connection, and how it ended. It holds the connection's
// ID, the HTTP status and an error code from a fixed set, never a token, a label or an address.
const codec = defineRecordCodec(
  kind,
  z.object({
    connection: z.string(),
    outcome: z.enum(['confirmed', 'refused', 'unknown', 'not_attempted']),
    status: z.int().nullable(),
    providerError: z.string().nullable().default(null),
  }),
);

// A record that was stored before its provider's name left the field keeps the error under the old
// key, and a stored record never changes.
const legacyErrorKey = 'googleError';

export const revocationRecordedCodec = {
  ...codec,
  decode: (payload: JSONObject) => {
    const legacy = payload[legacyErrorKey];
    const isLegacy = payload['providerError'] === undefined && typeof legacy === 'string';
    const current = isLegacy ? { ...payload, providerError: legacy } : payload;

    return codec.decode(current);
  },
};
