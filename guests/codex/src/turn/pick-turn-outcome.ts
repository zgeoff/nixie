import type { TurnOutcome } from '@heynixie/wire';

export interface TurnEnd {
  // the status that the CLI's turn/completed reports for a turn that did not fail
  readonly status: 'completed' | 'interrupted';

  // the guest sent turn/interrupt because the turn reached the model-call limit
  readonly hasLimitInterrupt: boolean;

  // the guest sent turn/interrupt because an interrupt frame asked for it
  readonly hasHostInterrupt: boolean;
}

// A turn that completes is finished, also when the guest interrupted it at its last call: the
// model's reply won the race. An interrupted turn is a limit stop only when the guest's own limit
// interrupt stopped it.
export function pickTurnOutcome(end: TurnEnd): TurnOutcome {
  if (end.status === 'completed') {
    return 'finished';
  }

  return end.hasLimitInterrupt && !end.hasHostInterrupt ? 'limit' : 'interrupted';
}
