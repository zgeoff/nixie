export interface SettlementRun {
  readonly openedSequence: number;

  // the report target the run pinned, or null when it pinned none
  readonly target: string | null;
}

export interface SettlementThreadFacts {
  readonly runs: readonly SettlementRun[];
  readonly starter: string | null;

  // the sequence of the record that opened the proposal
  readonly proposedSequence: number;
}

// The thread that hears a closed task's settlement: the target that the run which proposed it
// pinned, else the task's starter. The proposing run is the newest one opened at or before the
// proposal, so an older run's target never stands in for a run that pinned none.
export function pickSettlementThread(facts: SettlementThreadFacts): string | null {
  const proposing = facts.runs.findLast((run) => run.openedSequence <= facts.proposedSequence);

  return proposing?.target ?? facts.starter;
}
