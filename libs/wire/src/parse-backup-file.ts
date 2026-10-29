import type { z } from 'zod';
import { parseJSONOrNull } from './parse-json-or-null';

export type ParsedBackupFile<T> = { readonly value: T } | { readonly refused: string };

export function parseBackupFile<T>(text: string, schema: z.ZodType<T>): ParsedBackupFile<T> {
  const parsed = schema.safeParse(parseJSONOrNull(text));

  if (!parsed.success) {
    return {
      refused: parsed.error.issues
        .map((issue) => `${issue.path.join('.') || 'the file'}: ${issue.message}`)
        .join('; '),
    };
  }

  return { value: parsed.data };
}
