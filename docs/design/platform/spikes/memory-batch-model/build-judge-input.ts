import { conversation } from './conversation.ts';
import type { JudgeInput } from './run-judge.ts';

export interface JudgeSource {
  index: number;
  itemID: string | null;
  op: string;
  outcome: string;
  quote: string;
  reason: string | null;
  sourceID: number;
  text: string | null;
}

// Gives the judge each candidate's whole source message, so it can read what a short quote refers
// to. The quote sits between ⟪ ⟫ where it occurs verbatim; pasted spans keep their ⟦ ⟧ markers.
export function buildJudgeInput(candidates: JudgeSource[]): JudgeInput {
  return {
    candidates: candidates.map((candidate) => ({
      index: candidate.index,
      op: candidate.itemID === null ? candidate.op : `${candidate.op} ${candidate.itemID}`,
      outcome:
        candidate.reason === null ? candidate.outcome : `${candidate.outcome}: ${candidate.reason}`,
      quote: candidate.quote,
      source: renderSource(candidate.sourceID, candidate.quote),
      sourceID: candidate.sourceID,
      text: candidate.text,
    })),
  };
}

function renderSource(sourceID: number, quote: string): string {
  const turnIndex = (sourceID - 1) / 2;
  const turn = Number.isInteger(turnIndex) ? conversation.turns[turnIndex] : undefined;
  if (turn === undefined) {
    return `(record ${sourceID} is not an owner message)`;
  }
  const at = quote === '' ? -1 : turn.owner.indexOf(quote);
  if (at === -1) {
    return `${turn.owner} (the quote does not occur verbatim)`;
  }
  return `${turn.owner.slice(0, at)}⟪${quote}⟫${turn.owner.slice(at + quote.length)}`;
}
