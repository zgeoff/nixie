export interface GapFacts {
  readonly now: number;
  readonly approvals: number;
  readonly approvedCount: number;
  readonly declinedCount: number;
  readonly hasOpenProposal: boolean;
  readonly quietUntil: number | null;
}

export function canProposeRule(facts: GapFacts): boolean {
  return (
    facts.approvedCount >= facts.approvals &&
    facts.declinedCount === 0 &&
    !facts.hasOpenProposal &&
    (facts.quietUntil === null || facts.quietUntil < facts.now)
  );
}
