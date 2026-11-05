import type { TurnCase } from './build-turn-cases.ts';
import { isInCaseRanges } from './is-in-case-ranges.ts';
import { isMetaTurn } from './is-meta-turn.ts';
import type { Label } from './score-turns.ts';

export interface KeptLabels {
  kept: Label[];
  inRange: number;
  flagged: number;
  both: number;
  shredded: number;
}

// Keeps the labels the scores use: it drops a label on an excluded turn, on a turn about retrieval
// itself, and on a turn whose message or reply was shredded, since its text no longer exists.
export function pickKeptLabels(labels: readonly Label[], turns: readonly TurnCase[], excluded: { from: number; to: number }[]): KeptLabels {
  const turnsByCase = new Map(turns.map((turn) => [turn.caseID, turn]));
  const isInRange = (label: Label) => isInCaseRanges(label.caseID, excluded);
  const isFlagged = (label: Label) => {
    const turn = turnsByCase.get(label.caseID);

    return turn !== undefined && isMetaTurn(turn);
  };
  const isShredded = (label: Label) => turnsByCase.get(label.caseID)?.isShredded === true;

  return {
    kept: labels.filter((label) => !isInRange(label) && !isFlagged(label) && !isShredded(label)),
    inRange: labels.filter(isInRange).length,
    flagged: labels.filter(isFlagged).length,
    both: labels.filter((label) => isInRange(label) && isFlagged(label)).length,
    shredded: labels.filter(isShredded).length,
  };
}
