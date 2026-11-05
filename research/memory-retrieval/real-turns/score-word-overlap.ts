// @boundaries-ignore a spike imports the code it measures
import { splitContentWords } from '../../../modules/memory/src/split-content-words.ts';
import type { TurnCase } from './build-turn-cases.ts';
import type { Gold } from './score-turns.ts';

export interface OverlapGroup {
  needed: number;
  reached: number;
  recall: number;
}

// Splits the needed items a turn did not already hold by whether the item shares a content word with
// the message, leaving out the excluded names, and gives each group's recall in one ranking. A gap
// between the groups shows how far retrieval rests on shared words over shared meaning.
export function scoreWordOverlap(
  turns: TurnCase[],
  gold: Map<string, Gold>,
  reached: Map<string, readonly string[]>,
  excludedWords: readonly string[],
): { shared: OverlapGroup; none: OverlapGroup } {
  const excluded = new Set(excludedWords.flatMap((word) => splitContentWords(word.toLowerCase())));
  const toWords = (text: string) => new Set(splitContentWords(text.toLowerCase()).filter((word) => !excluded.has(word)));
  const groups = { shared: { needed: 0, reached: 0 }, none: { needed: 0, reached: 0 } };

  for (const turn of turns) {
    const expected = gold.get(turn.caseID);

    if (expected?.isLabelled !== true) {
      continue;
    }

    const queryWords = toWords(turn.query);
    const shown = new Set(reached.get(turn.caseID) ?? []);

    for (const candidate of turn.candidates) {
      if (!expected.relevant.has(candidate.itemID) || expected.delivered.has(candidate.itemID)) {
        continue;
      }

      const group = [...toWords(candidate.text)].some((word) => queryWords.has(word)) ? groups.shared : groups.none;

      group.needed += 1;
      group.reached += shown.has(candidate.itemID) ? 1 : 0;
    }
  }

  const finish = (group: { needed: number; reached: number }): OverlapGroup => ({
    ...group,
    recall: group.needed === 0 ? 0 : Math.round((group.reached / group.needed) * 1000) / 1000,
  });

  return { shared: finish(groups.shared), none: finish(groups.none) };
}
