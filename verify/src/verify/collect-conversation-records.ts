import { z } from 'zod';

export const conversationRecordSchema = z.object({
  event: z.literal('record'),
  sequence: z.int(),
  kind: z.string(),
  text: z.string().nullable(),
});

export type ConversationRecord = z.infer<typeof conversationRecordSchema>;

// The record lines the local harness printed, from the lines the stream driver recorded; any
// other line, such as the ready line, is left out.
export function collectConversationRecords(lines: readonly string[]): ConversationRecord[] {
  return lines.flatMap((line) => {
    const parsed = conversationRecordSchema.safeParse(parseJSONLine(line));

    return parsed.success ? [parsed.data] : [];
  });
}

function parseJSONLine(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}
