import type { EnvelopeRecord } from '@heynixie/log';
import { identityRefusedCodec } from './identity-refused-codec';

interface RefusalRecord {
  readonly channel: string;
  readonly externalID: string;
  readonly refusedAt: number;
}

// Reads an identity.refused record's payload, or null for a record of another kind or one whose
// payload lacks a field.
export function parseRefusalRecord(
  record: Pick<EnvelopeRecord, 'kind' | 'payload'>,
): RefusalRecord | null {
  if (record.kind !== identityRefusedCodec.kind) {
    return null;
  }

  const payload = identityRefusedCodec.tryDecodePartial(record.payload);

  if (
    payload?.channel === undefined ||
    payload.externalID === undefined ||
    payload.refusedAt === undefined
  ) {
    return null;
  }

  return {
    channel: payload.channel,
    externalID: payload.externalID,
    refusedAt: payload.refusedAt,
  };
}
