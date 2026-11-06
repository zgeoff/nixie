import type { TurnCase } from './build-turn-cases.ts';
import type { BlockTokens } from './build-block-tokens.ts';

export interface SummaryEntry {
  turn: TurnCase;
  tokens: BlockTokens;
  sessionHeld: number;
}

const blockNames = ['pinned', 'pinnedChanges', 'items', 'selfNotes', 'messages'] as const;

// Sums up each block's tokens over a group of turns, and the memory tokens a session held at each.
export function buildBlockSummary(group: SummaryEntry[]) {
  const blocks = blockNames.map((block) => {
    const values = group.map((entry) => entry.tokens[block]);
    const present = values.filter((value) => value > 0);

    return [
      block,
      { perTurn: buildMean(values), turnsWithIt: present.length, whenPresent: buildMean(present), p90WhenPresent: pickNearestRank(present, 0.9) },
    ];
  });
  const contexts = group.flatMap((entry) => (entry.turn.contextTokens === null ? [] : [entry.turn.contextTokens]));
  const held = group.map((entry) => entry.sessionHeld);

  return {
    turns: group.length,
    meanCallContext: buildMean(contexts),
    sessionHeld: { mean: buildMean(held), median: pickNearestRank(held, 0.5), max: pickNearestRank(held, 1) },
    turnsWithShownMessages: group.filter((entry) => entry.turn.shownMessages.length > 0).length,
    blocks: Object.fromEntries(blocks),
  };
}

function buildMean(numbers: number[]): number {
  return numbers.length === 0 ? 0 : Math.round((numbers.reduce((sum, value) => sum + value, 0) / numbers.length) * 100) / 100;
}

// The nearest-rank percentile: the smallest value with at least that share of values at or below it.
function pickNearestRank(numbers: number[], share: number): number {
  const sorted = numbers.toSorted((first, second) => first - second);

  return sorted[Math.max(Math.ceil(sorted.length * share) - 1, 0)] ?? 0;
}
