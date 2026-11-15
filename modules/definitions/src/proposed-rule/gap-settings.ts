export interface GapSettings {
  // approved answers in one group before nixie proposes a rule
  readonly approvals: number;
  readonly windowDays: number;
  readonly quietDays: number;
}

export const dayMs = 24 * 60 * 60 * 1000;
