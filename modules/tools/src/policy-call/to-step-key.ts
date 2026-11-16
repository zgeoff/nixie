// The step run ID is the step key and the lease generation, joined by an @.
export function toStepKey(stepRunID: string): string {
  const separator = stepRunID.lastIndexOf('@');

  return separator === -1 ? stepRunID : stepRunID.slice(0, separator);
}
