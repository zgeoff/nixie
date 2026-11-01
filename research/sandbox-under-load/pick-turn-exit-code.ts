export interface TurnEnd {
  readonly scenario: 'rotation' | 'parallel';
  readonly succeeded: boolean;
  readonly authenticationFailed: boolean;
}

// The rotation turn's last rotation leaves a refused value across a model request, so an
// authentication failure is the end that scenario expects.
export function pickTurnExitCode(end: TurnEnd): 0 | 1 {
  if (end.succeeded) {
    return 0;
  }

  return end.scenario === 'rotation' && end.authenticationFailed ? 0 : 1;
}
