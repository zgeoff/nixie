import type { ReadonlyDeep } from '@zgeoff/std';
import { toReadonlyDeep } from '@zgeoff/std';
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
  ReadonlyDeep<z.output<z.ZodObject<Shape>>>,
  ReadonlyDeep<z.output<z.ZodObject<{ -readonly [Key in keyof Shape]: z.ZodOptional<Shape[Key]> }>>>
> {
  const partial = schema.partial();

  // a writer's key the schema lacks throws, so a field a writer adds never drops unseen
  const strict = schema.strict();

  return {
    kind,
    encode: (payload) => toReadonlyDeep(strict.parse(payload)),
    parse: (input) => toReadonlyDeep(strict.parse(input)),
    decode: (payload) => toReadonlyDeep(schema.parse(payload)),
    tryDecodePartial: (payload) => {
      const parsed = partial.safeParse(payload);

      return parsed.success ? toReadonlyDeep(parsed.data) : null;
    },
  };
}
