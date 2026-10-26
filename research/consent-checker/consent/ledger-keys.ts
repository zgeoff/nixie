interface TurnEntry {
  stepSequence: number;
}

interface PairEntry {
  caseID: string;
}

// The key that ties a reservation to the record that settles it: a turn for the labeller, a pair for
// the checker.
export const ledgerKeys = {
  label: (entry: TurnEntry): string => `step ${entry.stepSequence}`,
  check: (entry: PairEntry): string => `case ${entry.caseID}`,
};
