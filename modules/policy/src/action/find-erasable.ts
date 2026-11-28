import type { JSONObject, LogRecord } from '@heynixie/log';
import { JSON_OBJECT_SCHEMA } from '@heynixie/log';
import { z } from 'zod';

const erasableSchema = z.object({
  input: z.record(z.string(), z.unknown()).default({}),
  destinations: z.object({ value: z.string() }).array().default([]),
  rule: z.record(z.string(), z.unknown()).optional(),
  ruleID: z.string().optional(),
  ruleSentence: z.string().optional(),
});

export function findErasable(record: LogRecord): z.output<typeof erasableSchema> | null {
  if (record.erasable.status !== 'readable') {
    return null;
  }

  return erasableSchema.parse(record.erasable.fields);
}

export function toJSONObject(value: Record<string, unknown>): JSONObject {
  return JSON_OBJECT_SCHEMA.parse(value);
}

export type ProposedFields = NonNullable<ReturnType<typeof findErasable>>;
