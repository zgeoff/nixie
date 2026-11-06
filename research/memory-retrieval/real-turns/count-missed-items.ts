import type { TurnCase } from './build-turn-cases.ts';
import type { MissingMap } from './score-turns.ts';

export type MissReason = 'held' | 'sensitive' | 'lapsed' | 'pooled' | 'eligible' | 'absent';

export interface MissedItems {
  turnsWithMiss: number;
  turnsWithMissOutsideList: number;
  unmatched: number;
  byReason: Record<MissReason, number>;
  turnsWithSensitiveMiss: number;
}

// An item the scores count as delivered, such as a pinned item or one the turn's own exchange added,
// counts as held, so this count and the scores agree on what the session already had.
export function countMissedItems(
  turns: TurnCase[],
  missing: MissingMap[],
  pooledByCase: Map<string, Set<string>>,
  heldByCase: Map<string, ReadonlySet<string>>,
): MissedItems {
  const turnsByCase = new Map(turns.map((turn) => [turn.caseID, turn]));
  const byReason: Record<MissReason, number> = { held: 0, sensitive: 0, lapsed: 0, pooled: 0, eligible: 0, absent: 0 };
  let turnsWithMiss = 0;
  let turnsWithMissOutsideList = 0;
  let turnsWithSensitiveMiss = 0;

  for (const entry of missing) {
    const turn = turnsByCase.get(entry.caseID);

    if (turn === undefined || entry.itemIDs.length + entry.unmatched === 0) {
      continue;
    }

    const reasons = entry.itemIDs.map((itemID) =>
      pickMissReason(turn, itemID, pooledByCase.get(entry.caseID) ?? new Set(), heldByCase.get(entry.caseID) ?? new Set()),
    );

    for (const reason of reasons) {
      byReason[reason] += 1;
    }

    turnsWithMiss += 1;
    turnsWithMissOutsideList += reasons.some((reason) => reason !== 'pooled') || entry.unmatched > 0 ? 1 : 0;
    turnsWithSensitiveMiss += reasons.includes('sensitive') ? 1 : 0;
  }

  return {
    turnsWithMiss,
    turnsWithMissOutsideList,
    unmatched: missing.reduce((sum, entry) => sum + entry.unmatched, 0),
    byReason,
    turnsWithSensitiveMiss,
  };
}

function pickMissReason(turn: TurnCase, itemID: string, pooled: Set<string>, held: ReadonlySet<string>): MissReason {
  const candidate = turn.candidates.find((entry) => entry.itemID === itemID);

  if (candidate === undefined) {
    return 'absent';
  }

  if (held.has(itemID) || turn.delivered.includes(`${candidate.itemID}@${candidate.version}`)) {
    return 'held';
  }

  if (candidate.isSensitive) {
    return 'sensitive';
  }

  if (candidate.isLapsed) {
    return 'lapsed';
  }

  return pooled.has(itemID) ? 'pooled' : 'eligible';
}
