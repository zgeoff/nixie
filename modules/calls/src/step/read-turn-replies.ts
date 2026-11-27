import type { LogRecord } from '@heynixie/log';
import { readThreadNewestFirst } from '@heynixie/log';
import { modelReplyCodec, readVoidedReplies } from '@heynixie/models';
import type { TasksContext } from '@heynixie/tasks';

export interface TurnReplies {
  // the text of each reply the step wrote, oldest first
  readonly texts: readonly string[];

  // the sequence of the newest reply, as the string that a cut names, or null for no reply
  readonly lastReplyRecordID: string | null;
}

// The replies that the step run wrote live to the call's thread and no void took back.
export async function readTurnReplies(
  context: Pick<TasksContext, 'log'>,
  taskID: string,
  stepRunID: string,
): Promise<TurnReplies> {
  const mine: LogRecord[] = [];

  for await (const record of readThreadNewestFirst(context, taskID, [modelReplyCodec.kind])) {
    if (modelReplyCodec.tryDecodePartial(record.payload)?.runID !== stepRunID) {
      break;
    }

    mine.push(record);
  }

  const voided = await readVoidedReplies(
    context.log.writer.db,
    mine.map((record) => record.sequence),
  );

  const kept = mine.filter((record) => !voided.has(record.sequence)).toReversed();

  return {
    texts: kept.map((record) => readReplyText(record)),
    lastReplyRecordID: kept.at(-1) === undefined ? null : String(kept.at(-1)?.sequence),
  };
}

function readReplyText(record: LogRecord): string {
  const text = record.erasable.status === 'readable' ? record.erasable.fields['text'] : undefined;

  return typeof text === 'string' ? text : '';
}
