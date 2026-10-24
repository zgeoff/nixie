import type { TurnCase } from './build-turn-cases.ts';
import type { Gold, Label } from './score-turns.ts';

export interface SampleKey {
  caseID: string;
  refs: Record<string, string>;
}

export type BuiltGold = { gold: Map<string, Gold> } | { unknownRefs: string[] };

// Turns each label's references into item IDs through the sample key, and returns every reference
// the key lacks, as caseID/ref, instead of dropping it.
export function buildGold(turns: TurnCase[], labels: Label[], keys: SampleKey[]): BuiltGold {
  const labelsByCase = new Map(labels.map((label) => [label.caseID, label]));
  const refsByCase = new Map(keys.map((entry) => [entry.caseID, entry.refs]));
  const gold = new Map<string, Gold>();
  const unknownRefs: string[] = [];

  for (const turn of turns) {
    const label = labelsByCase.get(turn.caseID);
    const refs = refsByCase.get(turn.caseID) ?? {};

    const toItem = (ref: string): string | null => {
      const itemID = refs[ref];

      if (itemID === undefined) {
        unknownRefs.push(`${turn.caseID}/${ref}`);
      }

      return itemID ?? null;
    };

    const relevant = (label?.relevant ?? []).map((ref) => toItem(ref)).filter((itemID) => itemID !== null);

    gold.set(turn.caseID, {
      relevant: new Set(relevant),
      best: label === undefined || label.best === null ? null : toItem(label.best),
      noise: new Set(turn.ratings.filter((rating) => rating.verdict !== 'helpful').map((rating) => rating.itemID)),
      // The product leaves out only the version it delivered, so an item counts as delivered only
      // at the version the turn could retrieve.
      delivered: new Set(
        turn.candidates
          .filter((candidate) => turn.delivered.includes(`${candidate.itemID}@${candidate.version}`))
          .map((candidate) => candidate.itemID),
      ),
      isLabelled: label !== undefined,
    });
  }

  return unknownRefs.length > 0 ? { unknownRefs } : { gold };
}
