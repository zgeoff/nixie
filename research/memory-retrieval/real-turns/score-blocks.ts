import { messageKeyPrefix } from './build-rating-sample.ts';
import type { TurnCase } from './build-turn-cases.ts';
import type { Gold } from './score-turns.ts';

export interface BlockScore {
  turnsShown: number;
  shown: number;
  helpful: number;
  misleading: number;
  precision: number;
  turnsWithHelpful: number;
}

export interface BlocksScore {
  turns: number;
  items: BlockScore;
  selfNotes: BlockScore;
  messages: BlockScore;
}

// Scores what each block actually showed on the labelled turns: the items and self notes the turn's
// retrieval logged, and the past messages its turn end recorded. A shown entry the rater named is
// helpful, one the rater called misleading made the reply worse, and every other shown entry is
// noise.
export function scoreBlocks(turns: TurnCase[], gold: Map<string, Gold>): BlocksScore {
  const labelled = turns.flatMap((turn) => {
    const expected = gold.get(turn.caseID);

    return expected?.isLabelled === true ? [{ turn, expected }] : [];
  });

  const score = (pick: (turn: TurnCase) => string[], isHelpful: (key: string, expected: Gold) => boolean): BlockScore => {
    const perTurn = labelled.map(({ turn, expected }) => {
      const shown = pick(turn);

      return {
        shown: shown.length,
        helpful: shown.filter((key) => isHelpful(key, expected)).length,
        misleading: shown.filter((key) => expected.misleading.has(key)).length,
      };
    });

    const shown = perTurn.reduce((sum, entry) => sum + entry.shown, 0);
    const helpful = perTurn.reduce((sum, entry) => sum + entry.helpful, 0);

    return {
      turnsShown: perTurn.filter((entry) => entry.shown > 0).length,
      shown,
      helpful,
      misleading: perTurn.reduce((sum, entry) => sum + entry.misleading, 0),
      precision: shown === 0 ? 0 : Math.round((helpful / shown) * 1000) / 1000,
      turnsWithHelpful: perTurn.filter((entry) => entry.helpful > 0).length,
    };
  };

  const loggedBySelf = (turn: TurnCase, isSelf: boolean): string[] => {
    const selves = new Set(turn.candidates.filter((candidate) => candidate.isSelf).map((candidate) => candidate.itemID));

    return turn.logged.filter((item) => selves.has(item.itemID) === isSelf).map((item) => item.itemID);
  };

  return {
    turns: labelled.length,
    items: score(
      (turn) => loggedBySelf(turn, false),
      (key, expected) => expected.relevant.has(key),
    ),
    selfNotes: score(
      (turn) => loggedBySelf(turn, true),
      (key, expected) => expected.relevant.has(key),
    ),
    messages: score(
      (turn) => turn.shownMessages.map((message) => `${messageKeyPrefix}${message.sequence}`),
      (key, expected) => expected.messages.has(key),
    ),
  };
}
