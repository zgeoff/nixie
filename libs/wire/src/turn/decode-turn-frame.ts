import type { z } from 'zod';

const decoder = new TextDecoder();

export function decodeTurnFrame<Frame>(schema: z.ZodType<Frame>, message: Uint8Array): Frame {
  return schema.parse(JSON.parse(decoder.decode(message)));
}
