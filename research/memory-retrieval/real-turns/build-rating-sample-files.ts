import { buildRatingSample } from './build-rating-sample.ts';
import { collectRatingPools } from './collect-rating-pools.ts';
import type { RatingSamplePlan } from './pick-rating-sample-plan.ts';
import { renderRatingParts } from './render-rating-parts.ts';
import type { RankedTurn } from './score-turns.ts';

export interface SampleFile {
  name: string;
  text: string;
}

export interface RatingSampleFiles {
  files: SampleFile[];
  summary: Record<string, number>;
}

export function buildRatingSampleFiles(
  plan: RatingSamplePlan,
  results: Map<string, RankedTurn[]>,
  options: { topPlaces: number; turnsPerPart: number },
): RatingSampleFiles {
  const sample = buildRatingSample(plan.chosen, collectRatingPools(plan.runs, results, plan.chosen.chosen, options.topPlaces));
  const parts = renderRatingParts(sample.turns, options.turnsPerPart);

  return {
    files: [
      { name: 'sample.jsonl', text: `${sample.turns.map((turn) => JSON.stringify(turn)).join('\n')}\n` },
      { name: 'sample-key.jsonl', text: `${sample.keys.map((key) => JSON.stringify(key)).join('\n')}\n` },
      ...parts.map((part, position) => ({ name: `part-${String(position + 1).padStart(2, '0')}.md`, text: part })),
    ],
    summary: {
      turns: sample.turns.length,
      ...sample.strata,
      parts: parts.length,
      refs: sample.turns.reduce((sum, turn) => sum + turn.items.length, 0),
      characters: parts.reduce((sum, part) => sum + part.length, 0),
    },
  };
}
