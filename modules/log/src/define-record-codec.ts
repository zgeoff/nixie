import type { z } from 'zod';
import type { JSONObject, RecordCodec, RecordKind } from './types';

// Defines the one codec for a record kind's plain payload. The writer encodes through it and every
// reader decodes through it, so a payload that changes shape fails type-checking at both ends, and
// the schema checks the value at both ends at run time.
export function defineRecordCodec<Kind extends RecordKind, Shape extends z.core.$ZodShape>(
  kind: Kind,
  schema: z.ZodObject<Shape> & z.ZodType<JSONObject>,
): RecordCodec<
  Kind,
  z.output<z.ZodObject<Shape>>,
  z.output<z.ZodObject<{ -readonly [Key in keyof Shape]: z.ZodOptional<Shape[Key]> }>>
> {
  const partial = schema.partial();

  return {
    kind,
    encode: (payload) => schema.parse(payload),
    decode: (payload) => schema.parse(payload),
    tryDecodePartial: (payload) => {
      const parsed = partial.safeParse(payload);

      return parsed.success ? parsed.data : null;
    },
  };
}
