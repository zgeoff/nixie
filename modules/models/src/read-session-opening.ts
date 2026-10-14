import type { TasksContext } from '@heynixie/tasks';
import { readPreviousReplies } from './read-previous-replies';
import { readRecentTurns } from './read-recent-turns';
import { renderReplyTimes } from './render-reply-times';
import { renderSessionHistory } from './render-session-history';
import { renderSessionMarker } from './render-session-marker';
import type { TurnSession } from './run-planned-turn';
import type { MessageTimeOptions } from './types';

export interface SessionOpeningQuery {
  readonly taskID: string;

  // the turn's first inbox record, which neither the history nor a reply's zone reaches
  readonly beforeSequence: number;

  // the budget, in tokens, of a new session's history
  readonly rebuildTokens: number;
  readonly times: MessageTimeOptions;
}

// What a turn opens with, and how many recent records it carries.
export interface SessionOpening {
  readonly blocks: readonly (string | null)[];
  readonly recentRecords: number;
}

// Reads the blocks a turn opens with: a new session's marker and the thread's recent turns, or for
// a resumed session, when each reply of the last turn was sent.
export async function readSessionOpening(
  context: Pick<TasksContext, 'log'>,
  session: TurnSession,
  query: SessionOpeningQuery,
): Promise<SessionOpening> {
  if (session.resume !== null) {
    const replies = await readPreviousReplies(context, query);

    return { blocks: [renderReplyTimes(replies, query.times)], recentRecords: 0 };
  }
  const recent = await readRecentTurns(context, { ...query, tokens: query.rebuildTokens });

  return {
    blocks: [renderSessionMarker(session.lost), renderSessionHistory(recent, query.times)],
    recentRecords: recent.length,
  };
}
