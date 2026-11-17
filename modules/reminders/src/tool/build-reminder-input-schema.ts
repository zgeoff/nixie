import type { JSONObject } from '@heynixie/log';
import { z } from 'zod';

export function buildReminderInputSchema(schema: z.ZodType): JSONObject {
  return z
    .record(z.string(), z.json())
    .parse(structuredClone(z.toJSONSchema(schema, { io: 'input', target: 'draft-2020-12' })));
}
