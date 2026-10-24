import { z } from 'zod';
import type { SampleKey } from './build-gold.ts';
import type { TurnCase } from './build-turn-cases.ts';
import { makeRandom } from './make-random.ts';

export const sampleTurnSchema = z.object({
  caseID: z.string(),
  earlier: z.array(z.object({ owner: z.string(), reply: z.string() })),
  message: z.string(),
  reply: z.string(),
  items: z.array(z.object({ ref: z.string(), text: z.string() })),
});

export type SampleTurn = z.infer<typeof sampleTurnSchema>;

export interface Sample {
  turns: SampleTurn[];
  keys: SampleKey[];
  kept: number;
}

// The turns a labeller marks, each with every item a turn could retrieve under a reference local
// to that turn, in a shuffled order, and a key that maps each reference to its item. The sample
// keeps every turn whose retrieval returned an item or was rated, and fills the rest at random
// from the other turns, up to the size, or takes every turn with no size. The seed is fixed, so
// the same export always gives the same sample.
export function buildSample(turns: TurnCase[], size: number | null): Sample {
  const random = makeRandom(259);
  const labelable = turns.filter((turn) => collectShown(turn).length > 0);
  const kept = labelable.filter((turn) => turn.logged.length > 0 || turn.ratings.length > 0);
  const rest = shuffle(
    labelable.filter((turn) => !kept.includes(turn)),
    random,
  );

  const chosen = [...kept, ...rest.slice(0, Math.max(0, (size ?? labelable.length) - kept.length))].toSorted(
    (first, second) => first.recalledSequence - second.recalledSequence,
  );

  const sample: Sample = { turns: [], keys: [], kept: kept.length };

  for (const turn of chosen) {
    const shown = shuffle(collectShown(turn), random);

    sample.turns.push({
      caseID: turn.caseID,
      earlier: turn.earlier.map((exchange) => ({
        owner: cutText(exchange.owner, 1200),
        reply: cutText(exchange.reply, 600),
      })),
      message: turn.query,
      reply: cutText(turn.reply, 1500),
      items: shown.map((candidate, position) => ({ ref: `M${position + 1}`, text: candidate.text })),
    });

    sample.keys.push({
      caseID: turn.caseID,
      refs: Object.fromEntries(shown.map((candidate, position) => [`M${position + 1}`, candidate.itemID])),
    });
  }

  return sample;
}

// A pinned item is in every turn's context already, and a lapsed one is out of retrieval's reach.
function collectShown(turn: TurnCase): TurnCase['candidates'] {
  return turn.candidates.filter((candidate) => !candidate.isPinned && !candidate.isLapsed);
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
