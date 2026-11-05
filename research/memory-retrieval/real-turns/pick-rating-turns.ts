import type { TurnCase } from './build-turn-cases.ts';
import { makeRandom } from './make-random.ts';
import { countWords } from './count-words.ts';

export interface RatingTurns {
  chosen: TurnCase[];
  strata: { short: number; shown: number; random: number };
}

// Picks the turns a rater marks: every short turn, every turn whose retrieval returned an item, and
// the rest at random from the hybrid turns, up to the size. A turn whose message or reply was
// shredded stays out, so a rater never sees a blank the turn never sent. The seed is fixed, so the same export
// always gives the same turns.
export function pickRatingTurns(turns: TurnCase[], size: number, shortWords: number): RatingTurns {
  const random = makeRandom(2358);
  const eligible = turns.filter((turn) => turn.searchMode === 'hybrid' && turn.candidates.length > 0 && !turn.isShredded);
  const short = eligible.filter((turn) => countWords(turn.query) <= shortWords);
  const shown = eligible.filter((turn) => !short.includes(turn) && turn.logged.length > 0);
  const kept = new Set([...short, ...shown]);
  const rest = shuffle(
    eligible.filter((turn) => !kept.has(turn)),
    random,
  ).slice(0, Math.max(0, size - kept.size));

  return {
    chosen: [...kept, ...rest].toSorted((first, second) => first.recalledSequence - second.recalledSequence),
    strata: { short: short.length, shown: shown.length, random: rest.length },
  };
}

function shuffle<T>(list: readonly T[], random: () => number): T[] {
  const copy = [...list];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    const held = copy[index];
    const swapped = copy[other];

    if (held !== undefined && swapped !== undefined) {
      copy[index] = swapped;
      copy[other] = held;
    }
  }

  return copy;
}
