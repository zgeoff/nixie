import type { TurnOutcome } from '@heynixie/wire';
import type { WorkerEnd } from './types';

export interface WorkerTurnFacts {
  // the outcome of the guest's last ended frame, or null when it sent none
  readonly ended: TurnOutcome | null;

  // what the guest's failed frame said, or null when it sent none
  readonly failure: string | null;

  // the text of the guest's last reply, trimmed
  readonly answer: string;
}

export interface WorkerEndFacts {
  // the calling step lost its lease or was ended
  readonly isAborted: boolean;
  readonly isMinutesUp: boolean;

  // the limit that the worker's own spend reached, which stopped the guest at the end of its call
  readonly tripped: 'tokens' | 'dollars' | null;

  // the calling turn was interrupted or reached its budget
  readonly isInterrupted: boolean;
  readonly stage: 'starting' | 'running';

  // what a throw said, or null when nothing threw
  readonly error: string | null;
  readonly turn: WorkerTurnFacts | null;
}

// A hard stop wins over any turn. A turn that ended with an answer stands, whatever a soft stop did
// meanwhile, because nothing is left to stop.
export function pickWorkerEnd(facts: WorkerEndFacts): WorkerEnd {
  if (facts.isAborted) {
    return { outcome: 'aborted' };
  }

  if (facts.isMinutesUp) {
    return { outcome: 'limit', limit: 'minutes' };
  }

  if (facts.error !== null) {
    return facts.stage === 'starting'
      ? { outcome: 'sandbox_failed', detail: facts.error }
      : { outcome: 'model_failed', detail: facts.error };
  }

  const turn = facts.turn;

  if (turn === null) {
    return { outcome: 'model_failed', detail: 'the guest sent no turn' };
  }

  if (turn.failure !== null) {
    return { outcome: 'model_failed', detail: turn.failure };
  }

  if (turn.ended === 'finished' && turn.answer !== '') {
    return { outcome: 'answered', answer: turn.answer };
  }

  if (facts.tripped !== null) {
    return { outcome: 'limit', limit: facts.tripped };
  }

  if (turn.ended === 'limit') {
    return { outcome: 'limit', limit: 'turns' };
  }

  if (turn.ended === 'interrupted' || facts.isInterrupted) {
    return { outcome: 'interrupted' };
  }

  if (turn.ended === 'overflow') {
    return { outcome: 'model_failed', detail: "the context passed the model's window" };
  }

  return { outcome: 'no_answer' };
}
