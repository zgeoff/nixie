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
  ReadonlyPayload<z.output<z.ZodObject<Shape>>>,
  ReadonlyPayload<
    z.output<z.ZodObject<{ -readonly [Key in keyof Shape]: z.ZodOptional<Shape[Key]> }>>
  >
> {
  const partial = schema.partial();

  // a writer's key the schema lacks throws, so a field a writer adds never drops unseen
  const strict = schema.strict();

  return {
    kind,
    encode: (payload) => toReadonlyPayload(strict.parse(payload)),
    decode: (payload) => toReadonlyPayload(schema.parse(payload)),
    tryDecodePartial: (payload) => {
      const parsed = partial.safeParse(payload);

      return parsed.success ? toReadonlyPayload(parsed.data) : null;
    },
  };
}

// a parsed value as its readonly form, which every value fits, though TypeScript cannot see it
// through the deferred conditional type
function toReadonlyPayload<Value>(value: Value): ReadonlyPayload<Value> {
  const parsed: unknown = value;

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a value fits its readonly form
  return parsed as ReadonlyPayload<Value>;
}

// a decoded payload, readonly all the way down, as a record's payload is
type ReadonlyPayload<Value> = Value extends readonly (infer Item)[]
  ? readonly ReadonlyPayload<Item>[]
  : Value extends object
    ? { readonly [Key in keyof Value]: ReadonlyPayload<Value[Key]> }
    : Value;
