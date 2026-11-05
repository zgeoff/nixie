import type { TurnCase } from './build-turn-cases.ts';
import { messageKeyPrefix } from './build-rating-sample.ts';
import type { Gold, Label, MissingMap } from './score-turns.ts';

export interface SampleKey {
  caseID: string;
  refs: Record<string, string>;
}

export interface GoldExtras {
  missing: MissingMap[];
  heldCases: ReadonlySet<string>;
  heldItems: ReadonlyMap<string, ReadonlySet<string>>;
}

export type BuiltGold = { gold: Map<string, Gold> } | { unknownRefs: string[]; absentCases: string[] };

// A left-out pinned item, every listed item of a held case, and every item the exchange added sit
// in the context already, so each counts as delivered. A reference or case the key or turns lack is
// returned rather than dropped, so a stale key fails loudly.
export function buildGold(turns: TurnCase[], labels: Label[], keys: SampleKey[], extra: GoldExtras = { missing: [], heldCases: new Set(), heldItems: new Map() }): BuiltGold {
  const labelsByCase = new Map(labels.map((label) => [label.caseID, label]));
  const refsByCase = new Map(keys.map((entry) => [entry.caseID, entry.refs]));
  const missingByCase = new Map(extra.missing.map((entry) => [entry.caseID, entry.itemIDs]));
  const gold = new Map<string, Gold>();
  const unknownRefs: string[] = [];

  for (const turn of turns) {
    const label = labelsByCase.get(turn.caseID);
    const refs = refsByCase.get(turn.caseID) ?? {};

    const findItem = (ref: string): string | null => {
      const itemID = refs[ref];

      if (itemID === undefined) {
        unknownRefs.push(`${turn.caseID}/${ref}`);
      }

      return itemID ?? null;
    };

    const named = (label?.relevant ?? []).map((ref) => findItem(ref)).filter((itemID) => itemID !== null);
    // An item the store did not hold at the turn could not be retrieved, so it never counts as missed.
    const held = new Set(turn.candidates.map((candidate) => candidate.itemID));
    const leftOut = label === undefined ? [] : (missingByCase.get(turn.caseID) ?? []).filter((itemID) => held.has(itemID));
    const pinned = new Set(turn.candidates.filter((candidate) => candidate.isPinned).map((candidate) => candidate.itemID));

    gold.set(turn.caseID, {
      relevant: new Set([...named.filter((key) => !key.startsWith(messageKeyPrefix)), ...leftOut]),
      messages: new Set(named.filter((key) => key.startsWith(messageKeyPrefix))),
      best: label === undefined || label.best === null ? null : findItem(label.best),
      misleading: new Set((label?.misleading ?? []).map((ref) => findItem(ref)).filter((itemID) => itemID !== null)),
      noise: new Set(turn.ratings.filter((rating) => rating.verdict !== 'helpful').map((rating) => rating.itemID)),
      // The product leaves out only the version it delivered, so an item counts as delivered only
      // at the version the turn could retrieve.
      delivered: new Set([
        ...turn.candidates
          .filter((candidate) => turn.delivered.includes(`${candidate.itemID}@${candidate.version}`))
          .map((candidate) => candidate.itemID),
        ...leftOut.filter((itemID) => pinned.has(itemID)),
        ...(extra.heldItems.get(turn.caseID) ?? []),
        ...(extra.heldCases.has(turn.caseID) ? Object.values(refs).filter((key) => !key.startsWith(messageKeyPrefix)) : []),
      ]),
      pinned: new Set(leftOut.filter((itemID) => pinned.has(itemID))),
      isLabelled: label !== undefined,
    });
  }

  const absentCases = labels.filter((label) => !gold.has(label.caseID)).map((label) => label.caseID);

  return unknownRefs.length > 0 || absentCases.length > 0 ? { unknownRefs, absentCases } : { gold };
}
