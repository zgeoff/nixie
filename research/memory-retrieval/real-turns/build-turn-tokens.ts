import type { TurnCase } from './build-turn-cases.ts';
import type { TurnTokens } from './collect-session-held.ts';
import { type BlockOptions, type BlockSources, type BlockTokens, buildBlockTokens } from './build-block-tokens.ts';

// Sums a turn's blocks for the session count. A turn that opened no session still gives the pinned
// block it would show at an opening, for a session that opened on a step with no turn.
export function buildTurnTokens(turn: TurnCase, tokens: BlockTokens, sources: BlockSources, options: BlockOptions): TurnTokens {
  return {
    sessionNumber: turn.sessionNumber,
    isSessionStart: turn.isSessionStart,
    added: tokens.pinned + tokens.items + tokens.selfNotes + tokens.messages,
    pinned: turn.isSessionStart ? tokens.pinned : buildBlockTokens({ ...turn, isSessionStart: true }, sources, options).pinned,
  };
}
