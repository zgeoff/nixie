export interface StepRunRef {
  readonly stepKey: string;
  readonly generation: number;
}

export function parseStepRunID(stepRunID: string): StepRunRef | null {
  const at = stepRunID.lastIndexOf('@');
  const generation = Number(stepRunID.slice(at + 1));

  if (at <= 0 || !Number.isSafeInteger(generation) || generation < 1) {
    return null;
  }

  return { stepKey: stepRunID.slice(0, at), generation };
}
