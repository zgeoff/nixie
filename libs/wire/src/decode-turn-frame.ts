import type { z } from 'zod';

const decoder = new TextDecoder();

// Decodes one framed message against a turn frame schema. Malformed JSON or a frame the schema
// refuses throws, so neither side acts on a frame the other never meant.
// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- a zod schema has no readonly form
export function decodeTurnFrame<Frame>(schema: z.ZodType<Frame>, message: Uint8Array): Frame {
  return schema.parse(JSON.parse(decoder.decode(message)));
}
