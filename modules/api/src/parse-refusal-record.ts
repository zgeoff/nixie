import type { EnvelopeRecord } from '@heynixie/log';

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
  if (record.kind !== 'identity.refused') {
    return null;
  }

  const payload = record.payload;

  if (
    typeof payload['channel'] !== 'string' ||
    typeof payload['externalID'] !== 'string' ||
    typeof payload['refusedAt'] !== 'number'
  ) {
    return null;
  }

  return {
    channel: payload['channel'],
    externalID: payload['externalID'],
    refusedAt: payload['refusedAt'],
  };
}
