import type { SetupStep } from './types';

export interface SetupPlaceholders {
  readonly redirectURI: string;
  readonly origin: string;
}

// Puts the two values a step's body names in their places, in the body and nowhere else.
export function fillSetupSteps(
  steps: readonly SetupStep[],
  values: SetupPlaceholders,
): SetupStep[] {
  return steps.map((step) => ({
    ...step,
    body: step.body
      .replaceAll('{redirectURI}', values.redirectURI)
      .replaceAll('{origin}', values.origin),
  }));
}
