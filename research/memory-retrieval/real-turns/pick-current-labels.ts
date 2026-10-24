import type { SampleTurn } from './build-sample.ts';
import type { TurnCase } from './build-turn-cases.ts';
import type { Label } from './score-turns.ts';

export interface CurrentLabels {
  labels: Label[];
  stale: string[];
}

// A label holds only for the message the labeller saw. When the rebuilt turn's query differs from
// the message in the sample, or the sample lacks the case, the label goes to the stale list
// instead of scoring a query it was never made for. A label whose case the turns lack stays, for
// the gold builder to refuse.
export function pickCurrentLabels(turns: TurnCase[], labels: Label[], samples: SampleTurn[]): CurrentLabels {
  const queries = new Map(turns.map((turn) => [turn.caseID, turn.query]));
  const messages = new Map(samples.map((sample) => [sample.caseID, sample.message]));
  const current: Label[] = [];
  const stale: string[] = [];

  for (const label of labels) {
    const query = queries.get(label.caseID);

    if (query === undefined || messages.get(label.caseID) === query) {
      current.push(label);
    } else {
      stale.push(label.caseID);
    }
  }

  return { labels: current, stale };
}
