import type { ReadonlyDeep } from '@zgeoff/std';
import { toReadonlyDeep } from '@zgeoff/std';
import { z } from 'zod';
import type { JSONObject, RecordCodec, RecordKind } from '../types';
import { JSON_OBJECT_SCHEMA } from './json-object-schema';

export function defineRecordCodec<Kind extends RecordKind, Shape extends z.core.$ZodShape>(
  kind: Kind,

  schema: z.ZodObject<Shape> & z.ZodType<JSONObject>,
): RecordCodec<
  Kind,
  ReadonlyDeep<z.output<z.ZodObject<Shape>>>,
  ReadonlyDeep<z.output<z.ZodObject<{ -readonly [Key in keyof Shape]: z.ZodOptional<Shape[Key]> }>>>
> {
  const partial = schema.partial();
  const strict = schema.strict();
  const encoder: z.ZodType = strict;

  return {
    kind,
    encode: (payload: unknown) => JSON_OBJECT_SCHEMA.parse(z.encode(encoder, payload)),
    parse: (input) => toReadonlyDeep(strict.parse(input)),
    decode: (payload) => toReadonlyDeep(schema.parse(payload)),
    tryDecodePartial: (payload) => {
      const parsed = partial.safeParse(payload);

      return parsed.success ? toReadonlyDeep(parsed.data) : null;
    },
  };
}
