import { readThreadNewestFirst } from '@heynixie/log';
import { z } from 'zod';
import type { LogContext } from './types';

const sessionSummarizedKind = 'model.session_summarized';

export interface SessionSummary {
  readonly sequence: number;
  readonly throughSequence: number;
  readonly text: string;
}

const readableText = z.object({
  status: z.literal('readable'),
  fields: z.object({ text: z.string() }),
});

const summarySchema = z.object({
  payload: z.object({ throughSequence: z.int().nonnegative() }),
  erasable: readableText,
});

export async function readSessionSummary(
  context: LogContext,
  taskID: string,
): Promise<SessionSummary | null> {
  for await (const record of readThreadNewestFirst(context, taskID, [sessionSummarizedKind])) {
    const parsed = summarySchema.safeParse(record);

    if (parsed.success) {
      return {
        sequence: record.sequence,
        throughSequence: parsed.data.payload.throughSequence,
        text: parsed.data.erasable.fields.text,
      };
    }
  }

  return null;
}
