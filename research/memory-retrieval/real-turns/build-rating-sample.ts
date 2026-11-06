import type { SampleKey } from './build-gold.ts';
import type { SampleTurn } from './build-sample.ts';
import type { TurnCase } from './build-turn-cases.ts';
import { makeRandom } from './make-random.ts';
import type { RatingTurns } from './pick-rating-turns.ts';

export interface RatingSample {
  turns: SampleTurn[];
  keys: SampleKey[];
  strata: RatingTurns['strata'];
}

// A past message's reference in the key names its sequence, so it never matches an item ID.
export const messageKeyPrefix = 'message:';

// Gives each chosen turn its pool: every item a compared setting shows it or ranks near the top,
// under a reference local to the turn in a shuffled order, and every past message the turn was
// shown. The seed is fixed, so the same turns and pools always give the same sample.
export function buildRatingSample(chosen: RatingTurns, pools: Map<string, string[]>): RatingSample {
  const random = makeRandom(2358);
  const sample: RatingSample = { turns: [], keys: [], strata: chosen.strata };

  for (const turn of chosen.chosen) {
    const pooled = new Set(pools.get(turn.caseID) ?? []);
    const items = shuffle(
      turn.candidates.filter((candidate) => pooled.has(candidate.itemID)),
      random,
    );

    const refs = [
      ...items.map((candidate, position) => ({ ref: `M${position + 1}`, key: candidate.itemID, text: candidate.text })),
      ...turn.shownMessages.map((message, position) => ({
        ref: `P${position + 1}`,
        key: `${messageKeyPrefix}${message.sequence}`,
        text: message.isCut ? `${message.text} …` : message.text,
      })),
    ];

    sample.turns.push({
      caseID: turn.caseID,
      earlier: turn.earlier.slice(-1).map((exchange) => ({
        owner: cutText(exchange.owner, 600),
        reply: cutText(exchange.reply, 400),
      })),
      message: turn.query,
      reply: cutText(turn.reply, 1000),
      items: refs.map((entry) => ({ ref: entry.ref, text: entry.text })),
    });

    sample.keys.push({ caseID: turn.caseID, refs: Object.fromEntries(refs.map((entry) => [entry.ref, entry.key])) });
  }

  return sample;
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

function cutText(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit)} …`;
}
