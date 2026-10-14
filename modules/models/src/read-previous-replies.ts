import type { LogRecord } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';
import type { HistoryTurn } from './read-recent-turns';
import { readThreadNewestFirst } from './read-thread-newest-first';

export interface PreviousRepliesQuery {
  readonly taskID: string;

  // the turn's first inbox record; a message from it on is pending, and answers no reply
  readonly beforeSequence: number;
}

// the turn's end records bound its replies, and your messages give each reply its zone
const previousTurnKinds = ['owner_message', 'model.reply', 'model.turn_ended'] as const;

// Reads the replies of the thread's last turn, oldest first, each with the message it answers. A
// turn's replies commit with its end record, so they sit between the newest end record and the one
// before it.
export async function readPreviousReplies(
  context: Pick<TasksContext, 'log'>,
  query: PreviousRepliesQuery,
): Promise<readonly HistoryTurn[]> {
  const replies = await Array.fromAsync(readRepliesNewestFirst(context, query));

  return replies.toReversed();
}

// The last turn's replies, newest first, each with the newest message before it that is not
// pending, or null when none comes before it. A reply waits for the next message read, and the read
// stops at the end record before the turn once no reply waits.
async function* readRepliesNewestFirst(
  context: Pick<TasksContext, 'log'>,
  query: PreviousRepliesQuery,
): AsyncGenerator<HistoryTurn> {
  const unanswered: LogRecord[] = [];
  const ends = { seen: 0 };

  for await (const record of readThreadNewestFirst(context, query.taskID, previousTurnKinds)) {
    if (record.kind === 'model.turn_ended') {
      ends.seen += 1;
    } else if (record.kind === 'model.reply' && ends.seen === 1) {
      unanswered.push(record);
    } else if (record.kind === 'owner_message' && record.sequence < query.beforeSequence) {
      yield* unanswered.splice(0).map((reply) => ({ record: reply, answered: record }));
    }
    if (ends.seen > 1 && unanswered.length === 0) {
      return;
    }
  }
  yield* unanswered.map((reply) => ({ record: reply, answered: null }));
}
