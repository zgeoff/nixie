import type { TasksContext } from '@heynixie/tasks';
import { readRecentTurns } from './read-recent-turns';
import { renderSessionHistory } from './render-session-history';
import { renderSessionMarker } from './render-session-marker';
import type { TurnSession } from './run-planned-turn';
import type { MessageTimeOptions } from './types';

export interface SessionOpeningQuery {
  readonly taskID: string;

  // the turn's first inbox record, which the history never reaches
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

// Reads the blocks a turn opens with: a new session's marker and the thread's recent turns, or none
// for a resumed session, which holds its history itself and learns each input's time from its
// stamp.
export async function readSessionOpening(
  context: Pick<TasksContext, 'log'>,
  session: TurnSession,
  query: SessionOpeningQuery,
): Promise<SessionOpening> {
  if (session.resume !== null) {
    return { blocks: [], recentRecords: 0 };
  }
  const recent = await readRecentTurns(context, { ...query, tokens: query.rebuildTokens });

  return {
    blocks: [renderSessionMarker(session.lost), renderSessionHistory(recent, query.times)],
    recentRecords: recent.length,
  };
}
