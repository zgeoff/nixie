import type { JSONObject } from '@heynixie/log';
import { z } from 'zod';
import type { TextRequest } from '../types';

const argumentsSchema = z.strictObject({ to: z.string(), body: z.string() });

// The text that a queued send's arguments name, or null when they are unreadable.
export function parseSendArguments(args: JSONObject): TextRequest | null {
  const parsed = argumentsSchema.safeParse(args);

  return parsed.success ? parsed.data : null;
}
