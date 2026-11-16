import type { JSONValue, RecordCodec } from '@heynixie/log';
import { z } from 'zod';

const cursorSchema = z.custom<JSONValue>((value) => z.json().safeParse(value).success);
const deliveredSchema = z.object({ source: z.string(), cursor: cursorSchema });
const strictSchema = deliveredSchema.strict();
const partialSchema = deliveredSchema.partial();

type TriggerDelivered = z.output<typeof deliveredSchema>;

type PartialDelivered = z.output<typeof partialSchema>;

// The cursor of a source after a batch, written only when it changes. It is a codec of its own,
// because the generic codec of a record cannot hold a cursor of any JSON shape.
export const triggerDeliveredCodec: RecordCodec<
  'trigger.delivered',
  TriggerDelivered,
  PartialDelivered
> = {
  kind: 'trigger.delivered',
  encode: (payload) => strictSchema.parse(payload),
  parse: (input) => strictSchema.parse(input),
  decode: (payload) => deliveredSchema.parse(payload),
  tryDecodePartial: (payload) => {
    const parsed = partialSchema.safeParse(payload);

    return parsed.success ? parsed.data : null;
  },
};
