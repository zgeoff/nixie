import type { z } from 'zod';
import type { JSONObject, RecordCodec, RecordKind } from './types';

// Defines the one codec for a record kind's plain payload. The writer encodes through it and every
// reader decodes through it, so a payload that changes shape fails type-checking at both ends, and
// the schema checks the value at both ends at run time.
export function defineRecordCodec<Kind extends RecordKind, Payload extends JSONObject>(
  kind: Kind,
  schema: z.ZodType<Payload>,
): RecordCodec<Kind, Payload> {
  return {
    kind,
    encode: (payload) => schema.parse(payload),
    decode: (payload) => schema.parse(payload),
    tryDecode: (payload) => {
      const parsed = schema.safeParse(payload);

      return parsed.success ? parsed.data : null;
    },
  };
}
