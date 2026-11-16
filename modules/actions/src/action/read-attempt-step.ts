import type { JSONObject } from '@heynixie/log';
import type { ActionRow } from '../types';
import type { AttemptCheck, AttemptVerdict } from './attempt-check';
import type { AttemptStep } from './pick-attempt-step';
import { pickAttemptStep } from './pick-attempt-step';

export interface AttemptFacts {
  readonly action: ActionRow;
  readonly arguments: JSONObject;
}

// Decides the action again from the stored call and the rules in force now. With no check, every
// attempt goes ahead.
export async function readAttemptStep(
  checkAttempt: AttemptCheck | undefined,
  facts: AttemptFacts,
): Promise<AttemptStep> {
  const verdict: AttemptVerdict =
    checkAttempt === undefined
      ? { kind: 'go', destinations: [] }
      : await checkAttempt({
          action: facts.action,
          arguments: facts.arguments,
          proposalID: facts.action.is_approved === 1 ? crypto.randomUUID() : facts.action.action_id,
        });

  return pickAttemptStep(verdict, facts.action);
}
