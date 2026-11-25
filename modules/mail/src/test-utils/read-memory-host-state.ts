import { existsSync, readFileSync } from 'node:fs';
import { z } from 'zod';
import type { MemoryHostState } from './types';

const bytesSchema = z.base64().transform((text) => Uint8Array.fromBase64(text));

const mailSchema = z.object({
  hostMessageID: z.string(),
  receivedAt: z.number(),
  raw: bytesSchema,
});

const sentSchema = z.object({ hostMessageID: z.string(), raw: bytesSchema });

const stateSchema = z.object({
  instance: z.string(),
  inbox: z.array(mailSchema),
  sent: z.array(sentSchema),
});

// The state that an earlier host wrote to the file, or null when the file does not exist.
export function readMemoryHostState(path: string): MemoryHostState | null {
  if (!existsSync(path)) {
    return null;
  }

  const text = readFileSync(path, 'utf8');

  return stateSchema.parse(JSON.parse(text));
}
