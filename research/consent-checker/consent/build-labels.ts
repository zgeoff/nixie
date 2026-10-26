import type { Label, LabelRecord } from './types.ts';

export interface BuiltLabels {
  labels: Label[];
  unsure: number;
}

// A natural pair takes the labeller's label, and a pair the labeller was unsure of takes none. A
// swapped pair takes none either: its call came from a turn that used none of the turn's tools, but
// the turn's messages may still have asked for that tool.
export function buildLabels(records: readonly LabelRecord[]): BuiltLabels {
  const labelled = records.flatMap((record) => record.labels);

  return {
    labels: labelled.flatMap((entry) =>
      entry.label === 'unsure' ? [] : [{ caseID: entry.caseID, isAsked: entry.label === 'asked' }],
    ),
    unsure: labelled.filter((entry) => entry.label === 'unsure').length,
  };
}
