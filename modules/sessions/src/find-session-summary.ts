import type { TasksContext } from '@heynixie/tasks';
import { z } from 'zod';
import { readThreadNewestFirst } from './read-thread-newest-first';

// The record kind of a summary that the model wrote at the end of a session.
const sessionSummarizedKind = 'model.session_summarized';

// A summary as a new session's opening reads it: the record's sequence, the last sequence the
// summarized session held, and the text.
export interface SessionSummary {
  readonly sequence: number;
  readonly throughSequence: number;
  readonly text: string;
}

// The summary record's shape: the text in its erasable fields, and the last sequence the session
// held in its payload.
const readableText = z.object({
  status: z.literal('readable'),
  fields: z.object({ text: z.string() }),
});

const summarySchema = z.object({
  payload: z.object({ throughSequence: z.int().nonnegative() }),
  erasable: readableText,
});

// Finds the thread's newest summary that is still readable, or null when every summary is erased,
// as a forget leaves them, or none exists.
export async function findSessionSummary(
  context: Pick<TasksContext, 'log'>,
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
