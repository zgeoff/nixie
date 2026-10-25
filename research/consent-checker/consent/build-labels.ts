import type { ConsentCase, Label, LabelRecord } from './types.ts';

export interface BuiltLabels {
  labels: Label[];
  unsure: number;
}

// A natural pair takes the labeller's label, and a pair the labeller was unsure of takes none. A
// swapped pair is not asked, because its call came from another turn.
export function buildLabels(cases: readonly ConsentCase[], records: readonly LabelRecord[]): BuiltLabels {
  const labelled = records.flatMap((record) => record.labels);
  const natural = labelled.flatMap((entry) =>
    entry.label === 'unsure' ? [] : [{ caseID: entry.caseID, isAsked: entry.label === 'asked' }],
  );
  const swapped = cases
    .filter((consentCase) => consentCase.bucket === 'swapped')
    .map((consentCase) => ({ caseID: consentCase.caseID, isAsked: false }));

  return {
    labels: [...natural, ...swapped],
    unsure: labelled.filter((entry) => entry.label === 'unsure').length,
  };
}
